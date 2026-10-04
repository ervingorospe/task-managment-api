import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toArray } from '../../../common/transformers/to-array.transformer';

/** Personal tickets have no org, so no memberIds/involvesUserId filter —
 * there's no one to filter by besides the owner themselves. */
export class PersonalTicketQueryDto extends PaginationQueryDto {
  /** Each entry is either the literal "overdue", the literal "starred",
   * or a tag id. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  filterBy?: string[];

  /** Case-insensitive title search. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dueDateFrom?: string;

  @IsOptional()
  @IsString()
  dueDateTo?: string;
}
