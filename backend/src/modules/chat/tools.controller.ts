/**
 * Tools Controller
 * 
 * Public endpoints for testing and executing tools directly
 */

import { Controller, Post, Body, Req, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { ToolService } from './tool.service';
import { ToolDispatcher } from './tools/tool.dispatcher';
import { AuthGuard } from '../../auth/auth.guard';

interface ExecuteToolRequest {
  toolName: string;
  input: Record<string, unknown>;
}

@Controller('tools')
@UseGuards(AuthGuard)
export class ToolsController {
  constructor(
    private readonly toolService: ToolService,
    private readonly toolDispatcher: ToolDispatcher,
  ) {}

  /**
   * List all available tools
   * GET /tools
   */
  @Post('list')
  async listTools(@Res() res: Response) {
    try {
      const tools = await this.toolService.listTools();
      return res.status(200).json({
        success: true,
        count: tools.length,
        tools,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        success: false,
        error: message,
      });
    }
  }

  /**
   * Execute a tool directly
   * POST /tools/execute
   * 
   * Body:
   * {
   *   "toolName": "create_event",
   *   "input": {
   *     "title": "Team Meeting",
   *     "start_time": "2026-04-07T14:00:00Z",
   *     "end_time": "2026-04-07T15:00:00Z"
   *   }
   * }
   */
  @Post('execute')
  async executeTool(@Req() req: Request, @Body() body: ExecuteToolRequest, @Res() res: Response) {
    try {
      const user = (req as any).user;
      const userId = user?.id;

      if (!userId) {
        throw new BadRequestException('User ID not found in request');
      }

      const { toolName, input } = body;

      if (!toolName) {
        throw new BadRequestException('toolName is required');
      }

      if (!input || typeof input !== 'object') {
        throw new BadRequestException('input must be a valid object');
      }

      const result = await this.toolDispatcher.dispatch(userId, toolName, input);

      return res.status(200).json({
        success: true,
        tool: toolName,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = error instanceof BadRequestException ? 400 : 500;

      return res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }

  /**
   * Get tool definition/schema
   * POST /tools/schema
   * 
   * Body:
   * {
   *   "toolName": "create_event"
   * }
   */
  @Post('schema')
  async getToolSchema(@Body('toolName') toolName: string, @Res() res: Response) {
    try {
      if (!toolName) {
        throw new BadRequestException('toolName is required');
      }

      const schema = this.toolDispatcher.getToolDefinition(toolName);

      return res.status(200).json({
        success: true,
        toolName,
        schema,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
}
