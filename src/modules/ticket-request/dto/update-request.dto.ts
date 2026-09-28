import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;
}
