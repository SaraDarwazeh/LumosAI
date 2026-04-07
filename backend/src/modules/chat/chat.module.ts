import { Module } from '@nestjs/common';
import { McpClient } from '../../clients/mcp.client';
import { MemoryClient } from '../../clients/memory.client';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ContextService } from './context.service';
import { DecisionService } from './decision.service';
import { LlmService } from './llm.service';
import { MemoryPolicyService } from './memory-policy.service';
import { PlannerService } from './planner.service';
import { ToolDispatcherService } from './tool-dispatcher.service';
import { ToolService } from './tool.service';
import { ToolDispatcher } from './tools/tool.dispatcher';
import { ToolRegistry } from './tools/tool.registry';
import { GoogleCalendarTools } from './tools/google-calendar.handler';
import { NotesTools } from './tools/notes.handler';
import { MemoryTools } from './tools/memory.handler';
import { EmailTools } from './tools/email.handler';
import { GoogleModule } from '../google/google.module';
import { ToolsController } from './tools.controller';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ConversationsModule, MessagesModule, GoogleModule, AuthModule, UsersModule],
  controllers: [ChatController, ToolsController],
  providers: [
    ChatService,
    ContextService,
    DecisionService,
    PlannerService,
    MemoryPolicyService,
    LlmService,
    ToolService,
    ToolDispatcher,
    ToolRegistry,
    ToolDispatcherService,
    GoogleCalendarTools,
    NotesTools,
    MemoryTools,
    EmailTools,
    ApiResponseInterceptor,
    MemoryClient,
    McpClient,
  ],
  exports: [ToolService, ToolDispatcher, ToolRegistry, McpClient, MemoryClient],
})
export class ChatModule {}
