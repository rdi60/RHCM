import { IsIn, IsObject, IsOptional, IsString } from "class-validator";

const GENDERS = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"] as const;

export class UpdatePatientDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];

  @IsOptional()
  @IsObject()
  addressJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  emergencyContactJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  guardianJson?: Record<string, unknown>;

  // Free-form JSON (typically a string array); shape isn't constrained here.
  @IsOptional()
  medicalAlertsJson?: unknown;

  @IsOptional()
  allergiesJson?: unknown;

  @IsOptional()
  medicalHistoryJson?: unknown;
}
