import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const MODULES = ['TICKET', 'REQUEST', 'MEMBER', 'ROLE', 'TAG'] as const;

export class LogActivityDto {
  @IsInt()
  orgId!: number;

  @IsIn(MODULES)
  module!: (typeof MODULES)[number];

  @IsString()
  action!: string;

  @IsInt()
  entityId!: number;

  @IsString()
  entityLabel!: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsInt()
  actorId!: number;

  @IsString()
  actorName!: string;

  @IsOptional()
  @IsString()
  actorAvatar?: string;

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  involvedUserIds!: number[];

  @IsString()
  description!: string;
}
