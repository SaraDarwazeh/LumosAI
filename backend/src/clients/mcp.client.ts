import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ToolMetadata {
  name: string;
  description: string;
  category: string;
  input_schema: Record<string, unknown>;
  example_input: Record<string, unknown>;
}

export interface ToolExecutionRequest {
  user_id: string;
  firebase_token: string | null;
  tool: string;
  input: Record<string, unknown>;
}

export interface ToolExecutionResponse {
  user_id: string;
  tool: string;
  result: unknown;
}

@Injectable()
export class McpClient {
  private readonly logger = new Logger(McpClient.name);
  private readonly baseUrl: string;
  private readonly timeout: number = 30000;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('MCP_BASE_URL') ?? 'http://mcp:8000';
  }

  async listTools(): Promise<ToolMetadata[]> {
    try {
      const response = await fetch(`${this.baseUrl}/tools`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`MCP server error: ${response.status}`);
      }

      return (await response.json()) as ToolMetadata[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list tools from MCP: ${message}`);
      throw error;
    }
  }

  async executeTool(
    userId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    firebaseToken: string | null = null,
  ): Promise<ToolExecutionResponse> {
    const request: ToolExecutionRequest = {
      user_id: userId,
      firebase_token: firebaseToken,
      tool: toolName,
      input: toolInput,
    };

    try {
      const response = await fetch(`${this.baseUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseBody = (await response.json()) as ToolExecutionResponse | { error?: unknown };

      if (!response.ok) {
        const errorMsg = 'error' in responseBody ? JSON.stringify(responseBody.error) : 'Unknown error';
        throw new Error(`Tool execution failed: ${errorMsg}`);
      }

      return responseBody as ToolExecutionResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to execute tool "${toolName}": ${message}`);
      throw error;
    }
  }
}
