import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tagName?: string;

  @IsOptional()
  @IsString()
  color?: string;
}
