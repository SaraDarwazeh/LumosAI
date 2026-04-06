import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CreateTaskDto } from './dto/create-task.dto';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';
import { UpdateTaskLabelsDto } from './dto/update-task-labels.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiResponseInterceptor } from './interceptors/api-response.interceptor';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseInterceptors(ApiResponseInterceptor)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createTaskDto: CreateTaskDto,
  ) {
    return this.tasksService.create(user.id, createTaskDto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetTasksQueryDto,
  ) {
    return this.tasksService.findAll(user.id, query);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.id, id, updateTaskDto);
  }

  @Patch(':id/labels')
  updateTaskLabels(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateTaskLabelsDto: UpdateTaskLabelsDto,
  ) {
    return this.tasksService.updateTaskLabels(user.id, id, updateTaskLabelsDto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tasksService.remove(user.id, id);
  }
}
