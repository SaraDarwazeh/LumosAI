import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateChatDto {
  @IsUUID('4')
  conversation_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;
}
