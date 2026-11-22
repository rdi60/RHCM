import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const GENDERS = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"] as const;

export class CreateTempRegistrationDto {
  @IsString()
  entityId!: string;

  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(130)
  ageYears?: number;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];

  @IsOptional()
  @IsString()
  visitReason?: string;

  @IsOptional()
  @IsString()
  preferredDoctorId?: string;
}
