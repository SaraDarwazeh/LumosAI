/**
 * Notes Tools
 */

import { Injectable, Logger } from '@nestjs/common';
import { ToolHandler, ToolResult } from './tool.interface';
import { PrismaService } from '../../../database/prisma.service';
import { MemoryClient } from '../../../clients/memory.client';

@Injectable()
export class NotesTools {
  private readonly logger = new Logger(NotesTools.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryClient: MemoryClient,
  ) {}

  /**
   * Create Note Handler
   */
  createNoteHandler(): ToolHandler {
    return {
      execute: async (userId: string, input: Record<string, unknown>): Promise<ToolResult> => {
        const startTime = Date.now();
        try {
          this.logger.debug(`Creating note for user: ${userId}`, { input });

          const title = input.title ? String(input.title).trim() : null;
          const content = String(input.content || '');
          if (!content.trim()) {
            return {
              success: false,
              error: 'Note content cannot be empty',
              executionTime: Date.now() - startTime,
            };
          }

          const note = await this.prisma.note.create({
            data: {
              user_id: userId,
              title,
              content,
            },
          });

          // Index note in memory
          await this.memoryClient.indexMemory({
            id: note.id,
            text: `${title ? `${title}: ` : ''}${content}`,
            type: 'note',
            metadata: {
              user_id: userId,
              source: 'tools',
              timestamp: new Date().toISOString(),
              memory_type: 'fact',
            },
          });

          this.logger.debug(`Note created: ${note.id}`);

          return {
            success: true,
            data: {
              id: note.id,
              title: note.title,
              content: note.content,
              created_at: note.created_at,
            },
            executionTime: Date.now() - startTime,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to create note: ${message}`, error);
          return {
            success: false,
            error: `Failed to create note: ${message}`,
            executionTime: Date.now() - startTime,
          };
        }
      },

      canExecute: async (): Promise<boolean> => true,

      getAccessDeniedReason: async (): Promise<string | null> => null,
    };
  }

  /**
   * Get Notes Handler
   */
  getNotesHandler(): ToolHandler {
    return {
      execute: async (userId: string, input: Record<string, unknown>): Promise<ToolResult> => {
        const startTime = Date.now();
        try {
          this.logger.debug(`Fetching notes for user: ${userId}`, { input });

          const limit = input.limit ? Number(input.limit) : 50;

          const notes = await this.prisma.note.findMany({
            where: { user_id: userId },
            take: limit,
            orderBy: { created_at: 'desc' },
          });

          this.logger.debug(`Found ${notes.length} notes`);

          return {
            success: true,
            data: {
              count: notes.length,
              notes: notes.map((n) => ({
                id: n.id,
                title: n.title,
                content: n.content,
                created_at: n.created_at,
              })),
            },
            executionTime: Date.now() - startTime,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to get notes: ${message}`, error);
          return {
            success: false,
            error: `Failed to retrieve notes: ${message}`,
            executionTime: Date.now() - startTime,
          };
        }
      },

      canExecute: async (): Promise<boolean> => true,

      getAccessDeniedReason: async (): Promise<string | null> => null,
    };
  }

  /**
   * Delete Note Handler
   */
  deleteNoteHandler(): ToolHandler {
    return {
      execute: async (userId: string, input: Record<string, unknown>): Promise<ToolResult> => {
        const startTime = Date.now();
        try {
          this.logger.debug(`Deleting note for user: ${userId}`, { input });

          const noteId = String(input.note_id || '');
          if (!noteId) {
            return {
              success: false,
              error: 'note_id is required',
              executionTime: Date.now() - startTime,
            };
          }

          // Verify ownership
          const note = await this.prisma.note.findUnique({
            where: { id: noteId },
          });

          if (!note) {
            return {
              success: false,
              error: 'Note not found',
              executionTime: Date.now() - startTime,
            };
          }

          if (note.user_id !== userId) {
            return {
              success: false,
              error: 'Unauthorized: you can only delete your own notes',
              executionTime: Date.now() - startTime,
            };
          }

          await this.prisma.note.delete({
            where: { id: noteId },
          });

          this.logger.debug(`Note deleted: ${noteId}`);

          return {
            success: true,
            data: {
              id: noteId,
              message: 'Note deleted successfully',
            },
            executionTime: Date.now() - startTime,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to delete note: ${message}`, error);
          return {
            success: false,
            error: `Failed to delete note: ${message}`,
            executionTime: Date.now() - startTime,
          };
        }
      },

      canExecute: async (): Promise<boolean> => true,

      getAccessDeniedReason: async (): Promise<string | null> => null,
    };
  }
}
