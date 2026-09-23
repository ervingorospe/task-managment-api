import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class AttachmentDto {
  @IsString()
  name!: string;

  @IsString()
  url!: string;

  @IsInt()
  size!: number;
}

/** No clientId/assigneeIds — those are Member ids, and a personal ticket
 * has no org, so no Member rows exist to reference. */
export class CreatePersonalTicketDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  tagId!: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
