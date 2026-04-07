import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { MemoryClient } from '../../clients/memory.client';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [ConversationsModule],
  controllers: [MessagesController],
  providers: [MessagesService, ApiResponseInterceptor, MemoryClient],
  exports: [MessagesService],
})
export class MessagesModule {}
