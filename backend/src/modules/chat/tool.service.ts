import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { McpClient } from '../../clients/mcp.client';
import { GoogleService } from '../google/google.service';
import { ToolDefinition, ToolExecutionResult } from './chat.types';
import { ToolDispatcher } from './tools/tool.dispatcher';
import { ToolRegistry } from './tools/tool.registry';
import { isValidToolName } from './tools/tool.constants';
import { GoogleCalendarTools } from './tools/google-calendar.handler';
import { NotesTools } from './tools/notes.handler';
import { MemoryTools } from './tools/memory.handler';
import { EmailTools } from './tools/email.handler';
import { PrismaService } from '../../database/prisma.service';
import { MemoryClient } from '../../clients/memory.client';

@Injectable()
export class ToolService implements OnModuleInit {
  private readonly logger = new Logger(ToolService.name);
  private toolCache: ToolDefinition[] | null = null;

  constructor(
    private readonly mcpClient: McpClient,
    private readonly googleService: GoogleService,
    private readonly toolDispatcher: ToolDispatcher,
    private readonly toolRegistry: ToolRegistry,
    private readonly prisma: PrismaService,
    private readonly memoryClient: MemoryClient,
    private readonly googleCalendarTools: GoogleCalendarTools,
    private readonly notesTools: NotesTools,
    private readonly memoryTools: MemoryTools,
    private readonly emailTools: EmailTools,
  ) {}

  /**
   * Initialize tool registry on module startup
   */
  async onModuleInit(): Promise<void> {
    this.registerAllTools();
  }

  /**
   * Register all tool handlers
   */
  private registerAllTools(): void {
    this.logger.debug('Registering all tools...');

    // Google Calendar Tools
    this.toolDispatcher.registerHandler('create_event', this.googleCalendarTools.createEventHandler());
    this.toolDispatcher.registerHandler('list_events', this.googleCalendarTools.listEventsHandler());

    // Notes Tools
    this.toolDispatcher.registerHandler('create_note', this.notesTools.createNoteHandler());
    this.toolDispatcher.registerHandler('get_notes', this.notesTools.getNotesHandler());
    this.toolDispatcher.registerHandler('delete_note', this.notesTools.deleteNoteHandler());

    // Memory Tools
    this.toolDispatcher.registerHandler('store_memory', this.memoryTools.storeMemoryHandler());
    this.toolDispatcher.registerHandler('search_memory', this.memoryTools.searchMemoryHandler());

    // Email Tools
    this.toolDispatcher.registerHandler('send_email', this.emailTools.sendEmailHandler());

    this.logger.debug('All tools registered successfully');
  }

  /**
   * List all available tools (local + MCP)
   */
  async listTools(): Promise<ToolDefinition[]> {
    if (this.toolCache) {
      return this.toolCache;
    }

    try {
      const localTools = this.toolDispatcher.getAvailableTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      // Try to fetch MCP tools
      let mcpTools: ToolDefinition[] = [];
      try {
        const mcpToolsRaw = await this.mcpClient.listTools();
        mcpTools = mcpToolsRaw.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema,
        }));
      } catch (error) {
        this.logger.warn(
          `Failed to fetch tools from MCP: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      this.toolCache = [...localTools, ...mcpTools];
      return this.toolCache;
    } catch (error) {
      this.logger.error(`Failed to list tools: ${error}`);
      return [];
    }
  }

  /**
   * Execute a tool
   * Prefers local tools, falls back to MCP
   */
  async execute(
    userId: string,
    toolName: string,
    input: Record<string, unknown>,
    firebaseToken: string | null = null,
  ): Promise<ToolExecutionResult> {
    try {
      this.logger.debug(`Tool execution requested: ${toolName}`, {
        userId,
        toolName,
        input,
      });

      // Try local tools first
      if (isValidToolName(toolName)) {
        const result = await this.toolDispatcher.dispatch(userId, toolName, input);
        this.logger.debug(`Local tool execution complete: ${toolName}`, {
          userId,
          success: result.success,
          executionTime: result.executionTime,
        });
        return {
          tool: toolName,
          output: JSON.stringify(result),
        };
      }

      // Fall back to MCP for unknown tools
      this.logger.debug(`Tool '${toolName}' not found locally, routing to MCP`, {
        userId,
        toolName,
        input,
      });
      const result = await this.mcpClient.executeTool(userId, toolName, input, firebaseToken);
      this.logger.debug(`MCP tool execution complete: ${toolName}`, {
        userId,
        toolName,
      });
      return {
        tool: toolName,
        output: JSON.stringify(result.result),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Tool execution failed: ${message}`, error);
      return {
        tool: toolName,
        output: JSON.stringify({
          success: false,
          error: message,
        }),
      };
    }
  }
}
