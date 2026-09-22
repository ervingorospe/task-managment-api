import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class MembersQueryDto extends PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  orgId!: number;

  @IsOptional()
  @IsIn(['name', 'email'])
  sortBy?: 'name' | 'email' = 'name';

  @IsOptional()
  @IsString()
  search?: string;
}
