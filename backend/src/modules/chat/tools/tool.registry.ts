/**
 * Tool Registry
 * 
 * Central registry for all tools with handler mapping
 */

import { Injectable, Logger } from '@nestjs/common';
import { ToolHandler, ToolMetadata } from './tool.interface';
import { TOOL_DEFINITIONS } from './tool.constants';

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private handlers: Map<string, ToolHandler> = new Map();
  private metadata: Map<string, ToolMetadata> = new Map();

  /**
   * Register a tool with its handler and metadata
   */
  register(toolName: string, handler: ToolHandler, toolMeta: ToolMetadata): void {
    if (this.handlers.has(toolName)) {
      this.logger.warn(`Tool '${toolName}' already registered, overwriting`);
    }

    this.handlers.set(toolName, handler);
    this.metadata.set(toolName, toolMeta);
    this.logger.debug(`Tool registered: ${toolName}`);
  }

  /**
   * Get handler for a tool
   */
  getHandler(toolName: string): ToolHandler | undefined {
    return this.handlers.get(toolName);
  }

  /**
   * Get metadata for a tool
   */
  getMetadata(toolName: string): ToolMetadata | undefined {
    return this.metadata.get(toolName);
  }

  /**
   * List all registered tools
   */
  listTools(): Array<{
    name: string;
    description: string;
    category: string;
    inputSchema: Record<string, unknown>;
  }> {
    return Array.from(this.metadata.values()).map((meta) => ({
      name: meta.name,
      description: meta.description,
      category: meta.category,
      inputSchema: meta.inputSchema,
    }));
  }

  /**
   * Check if tool is registered
   */
  has(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  /**
   * Get all handlers
   */
  getHandlers(): Map<string, ToolHandler> {
    return new Map(this.handlers);
  }
}
