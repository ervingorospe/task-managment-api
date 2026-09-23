import {
  IsDateString,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

// tagId, assigneeIds, and starred each moved to their own endpoint/DTO
// (update-ticket-tag, update-ticket-assignees, update-ticket-star) — each
// is gated by a different Rule (ticket.change.tag / ticket.assign / view
// access), so they can't share one combined permission check the way this
// title/description/dueDate trio can under ticket.update.
export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;
}
