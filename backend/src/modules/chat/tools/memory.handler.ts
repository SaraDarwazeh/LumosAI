/**
 * Memory Tools (Qdrant Integration)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ToolHandler, ToolResult } from './tool.interface';
import { MemoryClient } from '../../../clients/memory.client';
import { randomUUID } from 'crypto';

@Injectable()
export class MemoryTools {
  private readonly logger = new Logger(MemoryTools.name);

  constructor(private readonly memoryClient: MemoryClient) {}

  /**
   * Store Memory Handler
   */
  storeMemoryHandler(): ToolHandler {
    return {
      execute: async (userId: string, input: Record<string, unknown>): Promise<ToolResult> => {
        const startTime = Date.now();
        try {
          this.logger.debug(`Storing memory for user: ${userId}`, { input });

          const text = String(input.text || '');
          if (!text.trim()) {
            return {
              success: false,
              error: 'Memory text cannot be empty',
              executionTime: Date.now() - startTime,
            };
          }

          const memoryType = (input.memory_type || 'fact') as 'fact' | 'preference' | 'goal' | 'habit';
          const memoryId = randomUUID();

          const indexed = await this.memoryClient.indexMemory({
            id: memoryId,
            text,
            type: 'message',
            metadata: {
              user_id: userId,
              source: 'tools',
              timestamp: new Date().toISOString(),
              memory_type: memoryType,
              importance: 0.7,
            },
          });

          if (!indexed) {
            this.logger.warn(`Memory service unavailable while storing memory for user: ${userId}`);
            return {
              success: true,
              data: {
                memory_id: memoryId,
                text,
                memory_type: memoryType,
                timestamp: new Date().toISOString(),
                warning: 'Memory service unavailable. The memory was generated locally but not indexed.',
              },
              executionTime: Date.now() - startTime,
            };
          }

          this.logger.debug(`Memory stored: ${memoryId}`);

          return {
            success: true,
            data: {
              memory_id: memoryId,
              text,
              memory_type: memoryType,
              timestamp: new Date().toISOString(),
            },
            executionTime: Date.now() - startTime,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to store memory: ${message}`, error);
          return {
            success: false,
            error: `Failed to store memory: ${message}`,
            executionTime: Date.now() - startTime,
          };
        }
      },

      canExecute: async (): Promise<boolean> => true,

      getAccessDeniedReason: async (): Promise<string | null> => null,
    };
  }

  /**
   * Search Memory Handler
   */
  searchMemoryHandler(): ToolHandler {
    return {
      execute: async (userId: string, input: Record<string, unknown>): Promise<ToolResult> => {
        const startTime = Date.now();
        try {
          this.logger.debug(`Searching memory for user: ${userId}`, { input });

          const query = String(input.query || '');
          if (!query.trim()) {
            return {
              success: false,
              error: 'Query cannot be empty',
              executionTime: Date.now() - startTime,
            };
          }

          const topK = input.top_k ? Number(input.top_k) : 5;

          const results = await this.memoryClient.searchMemory({
            query,
            top_k: topK,
            user_id: userId,
          });

          this.logger.debug(`Found ${results.length} memory results`);

          return {
            success: true,
            data: {
              count: results.length,
              query,
              results: results.map((r) => ({
                id: r.id,
                text: r.text,
                score: r.score,
                type: r.type,
                timestamp: r.timestamp,
                metadata: r.metadata,
              })),
            },
            executionTime: Date.now() - startTime,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to search memory: ${message}`, error);
          return {
            success: false,
            error: `Failed to search memory: ${message}`,
            executionTime: Date.now() - startTime,
          };
        }
      },

      canExecute: async (): Promise<boolean> => true,

      getAccessDeniedReason: async (): Promise<string | null> => null,
    };
  }
}
