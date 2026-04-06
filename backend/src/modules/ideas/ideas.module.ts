import { Module } from '@nestjs/common';
import { MemoryClient } from '../../clients/memory.client';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { IdeasController } from './ideas.controller';
import { IdeasService } from './ideas.service';

@Module({
  controllers: [IdeasController],
  providers: [IdeasService, ApiResponseInterceptor, MemoryClient],
})
export class IdeasModule {}
