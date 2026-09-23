import { IsString, MaxLength } from 'class-validator';

export class AddCommentDto {
  @IsString()
  @MaxLength(10000)
  comment!: string;
}
