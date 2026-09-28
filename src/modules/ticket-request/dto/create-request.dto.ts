import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
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
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
