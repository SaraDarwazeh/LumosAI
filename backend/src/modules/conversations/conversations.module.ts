import { Module } from '@nestjs/common';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, ApiResponseInterceptor],
  exports: [ConversationsService],
})
export class ConversationsModule {}
