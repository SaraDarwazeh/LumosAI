import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { ApiResponseInterceptor } from './interceptors/api-response.interceptor';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, ApiResponseInterceptor],
})
export class TasksModule {}
