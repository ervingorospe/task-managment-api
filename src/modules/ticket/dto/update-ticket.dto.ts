import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// tagId, assigneeIds, and starred each moved to their own endpoint/DTO
// (update-ticket-tag, update-ticket-assignees, update-ticket-star) — each
// is gated by a different Rule (ticket.change.tag / ticket.assign / view
// access), so they can't share one combined permission check the way this
// title/description/dueDate/projectId group can under ticket.update.
export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;

  // null clears the ticket's project (moves it back to standalone);
  // undefined leaves it unchanged — same convention as dueDate above.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  projectId?: number | null;
}
