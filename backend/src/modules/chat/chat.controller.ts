import {
  Body,
  Controller,
  DefaultValuePipe,
  ParseBoolPipe,
  Post,
  Query,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';

@Controller('chat')
@UseInterceptors(ApiResponseInterceptor)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  createChat(
    @CurrentUser() user: AuthenticatedUser,
    @Request() req: ExpressRequest,
    @Query('debug', new DefaultValuePipe(false), ParseBoolPipe) debug: boolean,
    @Body() createChatDto: CreateChatDto,
  ) {
    const firebaseToken = this.extractBearerToken(req.headers.authorization);
    return this.chatService.chat(user.id, createChatDto, { debug, firebaseToken });
  }

  private extractBearerToken(authHeader?: string): string | null {
    if (!authHeader) return null;
    const [scheme, token] = authHeader.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
