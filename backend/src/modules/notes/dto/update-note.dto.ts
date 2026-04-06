import { AttachedToType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;

  @IsOptional()
  @IsEnum(AttachedToType)
  attached_to_type?: AttachedToType;

  @IsOptional()
  @IsUUID('4')
  attached_to_id?: string | null;
}
