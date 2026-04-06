import { Module } from '@nestjs/common';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  controllers: [RemindersController],
  providers: [RemindersService, ApiResponseInterceptor],
})
export class RemindersModule {}
