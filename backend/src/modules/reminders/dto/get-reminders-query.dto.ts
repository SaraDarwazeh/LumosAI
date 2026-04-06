import { ReminderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class GetRemindersQueryDto {
  @IsOptional()
  @IsUUID('4')
  task_id?: string;

  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;
}
