import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsOptional } from 'class-validator';
import { toArray } from '../../../common/transformers/to-array.transformer';

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
