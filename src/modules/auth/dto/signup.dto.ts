import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(50)
  firstName!: string;

  @IsString()
  @MaxLength(50)
  lastName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt silently truncates beyond 72 bytes
  password!: string;

  @IsString()
  confirmPassword!: string;
}
