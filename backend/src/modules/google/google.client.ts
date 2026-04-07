import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, Auth, calendar_v3 } from 'googleapis';

export interface GoogleOauthTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope?: string;
}

export interface GoogleCalendarEventInput {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
}

@Injectable()
export class GoogleClient {
  private readonly logger = new Logger(GoogleClient.name);
  private readonly oAuthClient: Auth.OAuth2Client;
  private readonly requiredScopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.send',
  ];
  private readonly timeoutMs = 15000;
  private readonly retryAttempts = 3;

  constructor(private readonly configService: ConfigService) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      this.logger.error(
        'Google OAuth configuration is missing. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.',
      );
    }

    this.oAuthClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  isConfigured(): boolean {
    return !!(
      this.configService.get<string>('GOOGLE_CLIENT_ID') &&
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') &&
      this.configService.get<string>('GOOGLE_REDIRECT_URI')
    );
  }

  getAuthorizationUrl(state: string) {
    return this.oAuthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: this.requiredScopes,
      state,
    });
  }

  async getToken(code: string) {
    const response = await this.retryAsync(() => this.withTimeout(this.oAuthClient.getToken(code), this.timeoutMs));
    const tokens = response.tokens as GoogleOauthTokens;

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Google OAuth did not return required tokens. Please authorize again with offline access.');
    }

    const grantedScopes = tokens.scope ? tokens.scope.split(' ') : await this.getGrantedScopes(tokens.access_token);
    const missingScopes = this.requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    if (missingScopes.length) {
      throw new Error(
        `Missing required Google scopes: ${missingScopes.join(', ')}. Please reauthorize the app with full permissions.`,
      );
    }

    return tokens;
  }

  async createCalendarEvent(
    tokens: GoogleOauthTokens,
    event: GoogleCalendarEventInput,
  ): Promise<{ event: calendar_v3.Schema$Event; updatedTokens: Partial<GoogleOauthTokens> }> {
    const client = await this.ensureValidClient(tokens);
    await this.validateScopes(client, ['https://www.googleapis.com/auth/calendar.events']);

    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await this.retryAsync(
      () =>
        this.withTimeout(
          calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
              summary: event.title,
              description: event.description ?? undefined,
              start: { dateTime: new Date(event.startTime).toISOString() },
              end: { dateTime: new Date(event.endTime).toISOString() },
            },
          }),
          this.timeoutMs,
        ),
      this.retryAttempts,
      500,
    );

    const updatedTokens: Partial<GoogleOauthTokens> = {
      access_token: client.credentials.access_token ?? tokens.access_token,
      refresh_token: client.credentials.refresh_token ?? tokens.refresh_token,
      expiry_date: client.credentials.expiry_date ?? tokens.expiry_date,
    };

    return {
      event: response.data,
      updatedTokens,
    };
  }

  async listCalendarEvents(
    tokens: GoogleOauthTokens,
    options: {
      startDate: string;
      endDate: string;
      maxResults: number;
    },
  ) {
    const client = await this.ensureValidClient(tokens);
    await this.validateScopes(client, ['https://www.googleapis.com/auth/calendar.events']);

    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await this.retryAsync(
      () =>
        this.withTimeout(
          calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date(options.startDate).toISOString(),
            timeMax: new Date(options.endDate).toISOString(),
            maxResults: options.maxResults,
            singleEvents: true,
            orderBy: 'startTime',
          }),
          this.timeoutMs,
        ),
      this.retryAttempts,
      500,
    );

    return response.data.items || [];
  }

  private async ensureValidClient(tokens: GoogleOauthTokens) {
    if (!tokens.access_token) {
      throw new Error('Missing Google access token. Please reconnect your Google account.');
    }

    if (!tokens.refresh_token) {
      this.logger.warn('Google refresh token is missing; token refresh may fail.');
    }

    const client = this.createAuthClient();
    client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    try {
      await this.withTimeout(client.getAccessToken(), this.timeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Unable to refresh Google credentials. Please reconnect your Google account. ${message}`,
      );
    }

    return client;
  }

  private async validateScopes(client: Auth.OAuth2Client, requiredScopes: string[]) {
    const accessToken = client.credentials.access_token;
    if (!accessToken) {
      throw new Error('Google access token is unavailable for scope validation.');
    }

    const oauth2 = google.oauth2({ auth: client, version: 'v2' });
    const response = await this.retryAsync(
      () => this.withTimeout(oauth2.tokeninfo({ access_token: accessToken }), this.timeoutMs),
      this.retryAttempts,
      500,
    );

    const grantedScopes = response.data.scope?.split(' ') ?? [];
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    if (missingScopes.length) {
      throw new Error(
        `Google token is missing required scopes: ${missingScopes.join(', ')}. Reconnect Google to grant full access.`,
      );
    }
  }

  private async getGrantedScopes(accessToken: string): Promise<string[]> {
    const oauth2 = google.oauth2({ auth: this.oAuthClient, version: 'v2' });
    const response = await this.retryAsync(
      () => this.withTimeout(oauth2.tokeninfo({ access_token: accessToken }), this.timeoutMs),
      this.retryAttempts,
      500,
    );

    return response.data.scope?.split(' ') ?? [];
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout;
    const timer = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Google API request timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timer]);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async retryAsync<T>(fn: () => Promise<T>, attempts = 3, delayMs = 300): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Google API attempt ${attempt} failed: ${message}. Retrying in ${delayMs}ms...`,
        );
        if (attempt === attempts) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  private createAuthClient() {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }
}
