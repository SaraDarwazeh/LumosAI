import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { CreateMessageDto } from './dto/create-message.dto';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseInterceptors(ApiResponseInterceptor)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    return this.messagesService.create(user.id, createMessageDto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.messagesService.findAll(user.id, query);
  }
}
