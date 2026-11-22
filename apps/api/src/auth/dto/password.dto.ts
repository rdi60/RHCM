import { IsEmail, IsString, MinLength } from "class-validator";

export class PasswordForgotDto {
  @IsEmail()
  email!: string;
}

export class PasswordResetDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(12, { message: "Password must be at least 12 characters" })
  newPassword!: string;
}
