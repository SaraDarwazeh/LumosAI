import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ChatModule } from '../chat/chat.module';
import { GoogleModule } from '../google/google.module';

@Module({
  imports: [ChatModule, GoogleModule],
  controllers: [HealthController],
})
export class HealthModule {}
