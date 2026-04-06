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
import { CreateIdeaDto } from './dto/create-idea.dto';
import { UpdateIdeaDto } from './dto/update-idea.dto';
import { IdeasService } from './ideas.service';

@Controller('ideas')
@UseInterceptors(ApiResponseInterceptor)
export class IdeasController {
  constructor(private readonly ideasService: IdeasService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createIdeaDto: CreateIdeaDto,
  ) {
    return this.ideasService.create(user.id, createIdeaDto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.ideasService.findAll(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateIdeaDto: UpdateIdeaDto,
  ) {
    return this.ideasService.update(user.id, id, updateIdeaDto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.ideasService.remove(user.id, id);
  }
}
