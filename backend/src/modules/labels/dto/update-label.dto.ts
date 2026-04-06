import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;
}
