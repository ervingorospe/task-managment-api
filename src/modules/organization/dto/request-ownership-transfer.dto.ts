import { IsEmail, MaxLength } from 'class-validator';

export class RequestOwnershipTransferDto {
  @IsEmail()
  @MaxLength(50)
  email!: string;
}
