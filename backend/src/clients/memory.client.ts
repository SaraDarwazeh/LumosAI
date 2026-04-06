import { Injectable, Logger } from '@nestjs/common';

type MemoryDocumentType = 'note' | 'idea';

interface IndexMemoryPayload {
  id: string;
  text: string;
  type: MemoryDocumentType;
  metadata: Record<string, unknown>;
}

@Injectable()
export class MemoryClient {
  private readonly logger = new Logger(MemoryClient.name);
  private readonly baseUrl = (process.env.MEMORY_SERVICE_URL ?? 'http://memory-service:8010')
    .replace(/\/$/, '');

  async indexMemory(payload: IndexMemoryPayload) {
    try {
      const response = await fetch(`${this.baseUrl}/memory/index`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: payload.id,
          text: payload.text,
          type: payload.type,
          metadata: payload.metadata,
        }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        this.logger.warn(
          `Memory indexing failed for ${payload.type} "${payload.id}" with status ${response.status}: ${responseBody}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Memory indexing request failed for ${payload.type} "${payload.id}": ${message}`,
      );
    }
  }

  async deleteMemory(id: string) {
    try {
      const response = await fetch(`${this.baseUrl}/memory/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const responseBody = await response.text();
        this.logger.warn(
          `Memory deletion failed for "${id}" with status ${response.status}: ${responseBody}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Memory deletion request failed for "${id}": ${message}`);
    }
  }
}
