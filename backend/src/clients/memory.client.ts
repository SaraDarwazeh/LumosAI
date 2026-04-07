import { Injectable, Logger } from '@nestjs/common';

type MemoryDocumentType = 'note' | 'idea' | 'message' | 'signal';

export interface MemoryMetadata {
  user_id: string;
  source?: string;
  timestamp?: string;
  importance?: number;
  confidence?: number;
  memory_type?: 'fact' | 'preference' | 'goal' | 'habit';
  [key: string]: unknown;
}

interface IndexMemoryPayload {
  id: string;
  text: string;
  type: MemoryDocumentType;
  metadata: MemoryMetadata;
}

interface SearchMemoryPayload {
  query: string;
  top_k: number;
  user_id: string | null;
}

export interface MemorySearchResult {
  id: string;
  score: number;
  text: string | null;
  type: string | null;
  original_id: string | null;
  timestamp: string | null;
  metadata: MemoryMetadata;
}

@Injectable()
export class MemoryClient {
  private readonly logger = new Logger(MemoryClient.name);
  private readonly baseUrl = (process.env.MEMORY_SERVICE_URL ?? 'http://memory-service:8010')
    .replace(/\/$/, '');
  private readonly timeoutMs = 15000;
  private readonly retryAttempts = 3;

  async indexMemory(payload: IndexMemoryPayload): Promise<boolean> {
    const metadata: MemoryMetadata = {
      source: 'application',
      timestamp: new Date().toISOString(),
      ...payload.metadata,
    };

    try {
      const response = await this.retryAsync(() =>
        fetch(`${this.baseUrl}/memory/index`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: payload.id,
            text: payload.text,
            type: payload.type,
            metadata,
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        }),
      );

      if (!response.ok) {
        const responseBody = await response.text();
        this.logger.warn(
          `Memory indexing failed for ${payload.type} "${payload.id}" with status ${response.status}: ${responseBody}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Memory indexing request failed for ${payload.type} "${payload.id}": ${message}`,
      );
      return false;
    }
  }

  async searchMemory(payload: SearchMemoryPayload): Promise<MemorySearchResult[]> {
    try {
      const response = await this.retryAsync(() =>
        fetch(`${this.baseUrl}/memory/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        }),
      );

      if (!response.ok) {
        const responseBody = await response.text();
        this.logger.warn(
          `Memory search failed for user "${payload.user_id}" with status ${response.status}: ${responseBody}`,
        );
        throw new Error(`Memory service request failed with status ${response.status}`);
      }

      const responseBody = (await response.json()) as {
        results?: MemorySearchResult[];
      };

      return Array.isArray(responseBody.results) ? responseBody.results : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Memory search request failed for user "${payload.user_id}": ${message}`,
      );
      throw new Error(`Memory service unavailable: ${message}`);
    }
  }

  async deleteMemory(id: string): Promise<boolean> {
    try {
      const response = await this.retryAsync(() =>
        fetch(`${this.baseUrl}/memory/${id}`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(this.timeoutMs),
        }),
      );

      if (!response.ok) {
        const responseBody = await response.text();
        this.logger.warn(
          `Memory deletion failed for "${id}" with status ${response.status}: ${responseBody}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Memory deletion request failed for "${id}": ${message}`);
      return false;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.retryAsync(() =>
        fetch(`${this.baseUrl}/memory/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: 'ping', top_k: 1, user_id: null }),
          signal: AbortSignal.timeout(this.timeoutMs),
        }),
      );

      return response.ok;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Memory service ping failed: ${message}`);
      return false;
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
        this.logger.warn(`Memory client attempt ${attempt} failed: ${message}`);
        if (attempt === attempts) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
}
