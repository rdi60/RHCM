import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class CreateEntityDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,19}$/, { message: "code must be uppercase letters/digits/underscore, starting with a letter" })
  code!: string;

  @IsString()
  legalName!: string;

  @IsString()
  displayName!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(["INR"])
  currency?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  chairCount!: number;

  @IsInt()
  @Min(0)
  @Max(20)
  otCount!: number;
}
