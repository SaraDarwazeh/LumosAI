import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { GoogleClient } from '../../modules/google/google.client';
import { ToolService } from '../chat/tool.service';
import { MemoryClient } from '../../clients/memory.client';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly toolService: ToolService,
    private readonly googleClient: GoogleClient,
    private readonly memoryClient: MemoryClient,
  ) {}

  @Get('tools')
  async tools() {
    const toolDefinitions = await this.toolService.listTools();
    return {
      status: 'ok',
      tool_count: toolDefinitions.length,
      tools: toolDefinitions.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    };
  }

  @Get('google')
  async google() {
    const configured = this.googleClient.isConfigured();
    return {
      status: configured ? 'ok' : 'error',
      configured,
      message: configured
        ? 'Google OAuth client configuration is available.'
        : 'Missing Google OAuth configuration. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.',
    };
  }

  @Get('memory')
  async memory() {
    const healthy = await this.memoryClient.ping();
    return {
      status: healthy ? 'ok' : 'error',
      message: healthy ? 'Memory service is reachable.' : 'Memory service is unreachable.',
    };
  }
}
