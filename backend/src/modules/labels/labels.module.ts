import { Module } from '@nestjs/common';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  controllers: [LabelsController],
  providers: [LabelsService, ApiResponseInterceptor],
})
export class LabelsModule {}
