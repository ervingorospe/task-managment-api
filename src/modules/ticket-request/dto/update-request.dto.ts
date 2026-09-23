import { IsOptional, IsString } from 'class-validator';

export class UpdateRequestDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
