import { IsUUID } from 'class-validator';

export class GetMessagesQueryDto {
  @IsUUID('4')
  conversation_id: string;
}
