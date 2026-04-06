import { ReminderType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateReminderDto {
  @IsOptional()
  @IsUUID('4')
  task_id?: string;

  @IsEnum(ReminderType)
  type: ReminderType;

  @IsDateString()
  scheduled_at: string;
}
