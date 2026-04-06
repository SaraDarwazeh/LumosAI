import { Module } from '@nestjs/common';
import { MemoryClient } from '../../clients/memory.client';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  controllers: [NotesController],
  providers: [NotesService, ApiResponseInterceptor, MemoryClient],
})
export class NotesModule {}
