import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdateTaskLabelsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  label_ids: string[];
}
