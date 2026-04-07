/**
 * Google Calendar Tools
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GoogleService } from '../../google/google.service';
import { ToolHandler, ToolResult } from './tool.interface';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class GoogleCalendarTools {
  private readonly logger = new Logger(GoogleCalendarTools.name);

  constructor(
    private readonly googleService: GoogleService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create Event Handler
   */
  createEventHandler(): ToolHandler {
    return {
      execute: async (userId: string, input: Record<string, unknown>): Promise<ToolResult> => {
        const startTime = Date.now();
        try {
          this.logger.debug(`Creating calendar event for user: ${userId}`, { input });

          const event = await this.googleService.createCalendarEventForUser(userId, {
            title: String(input.title || 'New Event'),
            description: input.description ? String(input.description) : undefined,
            startTime: String(input.start_time || new Date().toISOString()),
            endTime: String(input.end_time || new Date(Date.now() + 60 * 60 * 1000).toISOString()),
          });

          this.logger.debug(`Event created successfully: ${event.id}`);

          return {
            success: true,
            data: {
              eventId: event.id,
              htmlLink: event.htmlLink,
              summary: event.summary,
              start: event.start,
              end: event.end,
              description: event.description,
            },
            executionTime: Date.now() - startTime,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to create event: ${message}`, error);
          return {
            success: false,
            error: `Failed to create Google Calendar event: ${message}`,
            executionTime: Date.now() - startTime,
          };
        }
      },

      canExecute: async (userId: string): Promise<boolean> => {
        const googleAccount = await this.prisma.googleAccount.findUnique({
          where: { userId },
        });
        return !!googleAccount;
      },

      getAccessDeniedReason: async (userId: string): Promise<string | null> => {
        const googleAccount = await this.prisma.googleAccount.findUnique({
          where: { userId },
        });
        if (!googleAccount) {
          return 'No Google account connected. Please connect your Google account first.';
        }
        return null;
      },
    };
  }

  /**
   * List Events Handler
   */
  listEventsHandler(): ToolHandler {
    return {
      execute: async (userId: string, input: Record<string, unknown>): Promise<ToolResult> => {
        const startTime = Date.now();
        try {
          this.logger.debug(`Listing calendar events for user: ${userId}`, { input });

          const startDate = String(input.start_date || new Date().toISOString());
          const endDate = String(
            input.end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          );
          const maxResults = input.max_results ? Number(input.max_results) : 10;

          const events = await this.googleService.listCalendarEventsForUser(userId, {
            startDate,
            endDate,
            maxResults,
          });

          this.logger.debug(`Found ${events.length} events`);

          return {
            success: true,
            data: {
              count: events.length,
              events: events.map((e) => ({
                id: e.id,
                summary: e.summary,
                start: e.start,
                end: e.end,
                description: e.description,
                htmlLink: e.htmlLink,
              })),
            },
            executionTime: Date.now() - startTime,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to list events: ${message}`, error);
          return {
            success: false,
            error: `Failed to list Google Calendar events: ${message}`,
            executionTime: Date.now() - startTime,
          };
        }
      },

      canExecute: async (userId: string): Promise<boolean> => {
        const googleAccount = await this.prisma.googleAccount.findUnique({
          where: { userId },
        });
        return !!googleAccount;
      },

      getAccessDeniedReason: async (userId: string): Promise<string | null> => {
        const googleAccount = await this.prisma.googleAccount.findUnique({
          where: { userId },
        });
        if (!googleAccount) {
          return 'No Google account connected. Please connect your Google account first.';
        }
        return null;
      },
    };
  }
}
