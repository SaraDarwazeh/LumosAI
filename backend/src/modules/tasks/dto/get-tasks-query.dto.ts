import { TaskStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class GetTasksQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ValidateIf((_, value) => value !== undefined)
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsUUID('4')
  label_id?: string;
}
