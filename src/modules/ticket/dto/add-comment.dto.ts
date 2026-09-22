import { IsInt, IsString, MaxLength } from 'class-validator';

export class AddCommentDto {
  // No auth yet, so the author has to be told explicitly for now — once a
  // real auth guard exists this should come from the authenticated user,
  // not the body.
  @IsInt()
  userId!: number;

  @IsString()
  @MaxLength(10000)
  comment!: string;
}
