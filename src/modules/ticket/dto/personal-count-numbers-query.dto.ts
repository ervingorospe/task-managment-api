import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsOptional } from 'class-validator';

function toArray({ value }: { value: unknown }) {
  if (value == null) return undefined;
  return Array.isArray(value) ? value : [value];
}

export class PersonalCountNumbersQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  filterBy?: string[];
}
