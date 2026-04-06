import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { GetRemindersQueryDto } from './dto/get-reminders-query.dto';
import { RemindersService } from './reminders.service';

@Controller('reminders')
@UseInterceptors(ApiResponseInterceptor)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createReminderDto: CreateReminderDto,
  ) {
    return this.remindersService.create(user.id, createReminderDto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetRemindersQueryDto,
  ) {
    return this.remindersService.findAll(user.id, query);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.remindersService.remove(user.id, id);
  }
}
