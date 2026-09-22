import { Type } from 'class-transformer';
import {
  IsArray,
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

export class CreateRequestDto {
  // No auth yet, so the submitting member has to be told explicitly for
  // now — see AddCommentDto for the same note.
  @IsInt()
  clientId!: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
