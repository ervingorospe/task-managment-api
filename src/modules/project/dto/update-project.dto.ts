import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  // null clears the project's client; undefined leaves it unchanged — same
  // convention as UpdateTicketDto.projectId.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  clientId?: number | null;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  assigneeIds?: number[];
}
