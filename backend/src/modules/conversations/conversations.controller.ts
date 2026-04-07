import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseInterceptors(ApiResponseInterceptor)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createConversationDto: CreateConversationDto,
  ) {
    return this.conversationsService.create(user.id, createConversationDto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.findAll(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.conversationsService.findOne(user.id, id);
  }
}
