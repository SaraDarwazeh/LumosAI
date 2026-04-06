import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ApiResponseInterceptor } from '../tasks/interceptors/api-response.interceptor';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { LabelsService } from './labels.service';

@Controller('labels')
@UseInterceptors(ApiResponseInterceptor)
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createLabelDto: CreateLabelDto,
  ) {
    return this.labelsService.create(user.id, createLabelDto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.labelsService.findAll(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateLabelDto: UpdateLabelDto,
  ) {
    return this.labelsService.update(user.id, id, updateLabelDto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.labelsService.remove(user.id, id);
  }
}
