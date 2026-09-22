import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional } from 'class-validator';

export class ApproveRequestDto {
  @IsInt()
  tagId!: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  assigneeIds?: number[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
