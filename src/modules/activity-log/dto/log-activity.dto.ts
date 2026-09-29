import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const MODULES = [
  'TICKET',
  'REQUEST',
  'MEMBER',
  'ROLE',
  'TAG',
  'PROJECT',
] as const;

export class LogActivityDto {
  // Absent for a personal (org-less) ticket's activity — the owner is
  // always the actor for their own personal activity, so it's scoped by
  // actorId instead. See ActivityLogService.listPersonal().
  @IsOptional()
  @IsInt()
  orgId?: number;

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
