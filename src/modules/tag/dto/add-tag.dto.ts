import { IsString, MaxLength } from 'class-validator';

export class AddTagDto {
  @IsString()
  @MaxLength(50)
  tagName!: string;

  @IsString()
  color!: string;
}
