import { Module } from '@nestjs/common';
import { GoogleClient } from './google.client';
import { GoogleController } from './google.controller';
import { GoogleService } from './google.service';

@Module({
  controllers: [GoogleController],
  providers: [GoogleClient, GoogleService],
  exports: [GoogleService, GoogleClient],
})
export class GoogleModule {}
