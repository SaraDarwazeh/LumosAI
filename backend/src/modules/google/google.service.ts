import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GoogleClient, GoogleCalendarEventInput, GoogleOauthTokens } from './google.client';

@Injectable()
export class GoogleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleClient: GoogleClient,
  ) {}

  createOAuthRedirectUrl(userId: string): string {
    const state = Buffer.from(JSON.stringify({ userId }), 'utf8').toString('base64url');
    return this.googleClient.getAuthorizationUrl(state);
  }

  async connectWithCode(code: string, encodedState: string) {
    const stateJson = Buffer.from(encodedState, 'base64url').toString('utf8');
    const { userId } = JSON.parse(stateJson) as { userId: string };

    const tokens = await this.googleClient.getToken(code);
    const account = await this.createOrUpdateGoogleAccount(userId, tokens);
    return account;
  }

  async createCalendarEventForUser(userId: string, event: GoogleCalendarEventInput) {
    const account = await this.prisma.googleAccount.findUnique({
      where: { userId },
    });

    if (!account) {
      throw new NotFoundException(
        'No Google account is connected for this user. Connect Google first at /auth/google.',
      );
    }

    const tokens: GoogleOauthTokens = {
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiryDate.getTime(),
    };

    const { event: createdEvent, updatedTokens } = await this.googleClient.createCalendarEvent(tokens, event);

    await this.prisma.googleAccount.update({
      where: { userId },
      data: {
        accessToken: updatedTokens.access_token ?? account.accessToken,
        refreshToken: updatedTokens.refresh_token ?? account.refreshToken,
        expiryDate: updatedTokens.expiry_date
          ? new Date(updatedTokens.expiry_date)
          : account.expiryDate,
      },
    });

    return createdEvent;
  }

  async listCalendarEventsForUser(userId: string, options: {
    startDate: string;
    endDate: string;
    maxResults: number;
  }) {
    const account = await this.prisma.googleAccount.findUnique({
      where: { userId },
    });

    if (!account) {
      throw new NotFoundException(
        'No Google account is connected for this user. Connect Google first at /auth/google.',
      );
    }

    const tokens: GoogleOauthTokens = {
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiryDate.getTime(),
    };

    return this.googleClient.listCalendarEvents(tokens, options);
  }

  async getOrCreateTestUser() {
    let testUser = await this.prisma.user.findUnique({
      where: { firebase_uid: 'test-user' },
    });

    if (!testUser) {
      testUser = await this.prisma.user.create({
        data: {
          firebase_uid: 'test-user',
          email: 'test@lumos.dev',
        },
      });
    }

    return testUser;
  }

  private async createOrUpdateGoogleAccount(userId: string, tokens: GoogleOauthTokens) {
    return this.prisma.googleAccount.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: new Date(tokens.expiry_date),
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: new Date(tokens.expiry_date),
      },
    });
  }
}
