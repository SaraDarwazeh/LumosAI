/**
 * Tool Dispatcher (Updated)
 *
 * Routes tool execution to registered handlers using registry pattern
 * Validates permissions and input before execution
 */

import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { GoogleService } from '../../google/google.service';
import { ToolRegistry } from './tool.registry';
import { ToolHandler, ToolResult } from './tool.interface';
import { isValidToolName, TOOL_DEFINITIONS } from './tool.constants';

export interface ToolInput {
  [key: string]: unknown;
}

@Injectable()
export class ToolDispatcher {
  private readonly logger = new Logger(ToolDispatcher.name);

  constructor(
    private readonly googleService: GoogleService,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  /**
   * Execute a tool by name with input validation and permission checks
   * Returns standardized ToolResult
   */
  async dispatch(userId: string, toolName: string, input: ToolInput): Promise<ToolResult> {
    this.logger.debug(`Dispatching tool: ${toolName} for user: ${userId}`, {
      toolName,
      userId,
      input,
    });

    // Validate tool exists
    if (!isValidToolName(toolName)) {
      throw new NotFoundException(`Tool '${toolName}' not found`);
    }

    // Get handler from registry
    const handler = this.toolRegistry.getHandler(toolName);
    if (!handler) {
      throw new NotFoundException(`Handler for tool '${toolName}' not registered`);
    }

    try {
      // Validate input schema
      this.validateInput(toolName, input);

      // Check permissions
      const canExecute = await handler.canExecute(userId);
      if (!canExecute) {
        const reason =
          (await handler.getAccessDeniedReason(userId)) ||
          `Permission denied for tool '${toolName}'`;
        throw new ForbiddenException(reason);
      }

      // Execute handler
      const result = await handler.execute(userId, input);

      // Log execution
      this.logger.debug(`Tool executed: ${toolName}`, {
        userId,
        success: result.success,
        executionTime: result.executionTime,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Tool execution failed: ${message}`, error);
      throw error;
    }
  }

  /**
   * Validate tool input against its schema
   */
  private validateInput(toolName: string, input: ToolInput): void {
    const toolDef = TOOL_DEFINITIONS[toolName as keyof typeof TOOL_DEFINITIONS];
    if (!toolDef) {
      throw new NotFoundException(`Tool definition not found: ${toolName}`);
    }

    const schema = toolDef.inputSchema as any;
    const required = schema.required || [];

    // Check required fields
    for (const field of required) {
      if (!(field in input) || input[field] === undefined || input[field] === null) {
        throw new BadRequestException(`Missing required field: ${field}`);
      }
    }

    // Validate field types
    if (schema.properties) {
      for (const [key, value] of Object.entries(input)) {
        if (key in schema.properties) {
          const propSchema = schema.properties[key] as any;
          const expectedType = propSchema.type;

          if (expectedType && expectedType !== 'null') {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== expectedType) {
              throw new BadRequestException(
                `Invalid type for field '${key}': expected ${expectedType}, got ${actualType}`,
              );
            }

            // Validate enums if present
            if (propSchema.enum && !propSchema.enum.includes(value)) {
              throw new BadRequestException(
                `Invalid value for field '${key}': must be one of ${propSchema.enum.join(', ')}`,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Get all available tools
   */
  getAvailableTools() {
    return this.toolRegistry.listTools();
  }

  /**
   * Get definition for a specific tool
   */
  getToolDefinition(toolName: string) {
    if (!isValidToolName(toolName)) {
      throw new NotFoundException(`Tool '${toolName}' not found`);
    }
    return this.toolRegistry.getMetadata(toolName);
  }

  /**
   * Register a handler (for testing/setup)
   */
  registerHandler(toolName: string, handler: ToolHandler): void {
    const toolDef = TOOL_DEFINITIONS[toolName as keyof typeof TOOL_DEFINITIONS];
    if (!toolDef) {
      throw new NotFoundException(`Tool definition '${toolName}' not found`);
    }

    this.toolRegistry.register(toolName, handler, {
      name: toolDef.name,
      description: toolDef.description,
      category: toolDef.category || 'other',
      requiredIntegrations: (toolDef as any).requiredIntegrations,
      inputSchema: toolDef.inputSchema,
    });
  }
}
