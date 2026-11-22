import { IsBoolean, IsOptional, IsString } from "class-validator";

export class CheckInDto {
  @IsString()
  entityId!: string;

  /** Omit to create a genuinely new patient; set to match an existing one. */
  @IsOptional()
  @IsString()
  matchedPatientId?: string;

  /** Required (and must be true) only when the match is to a patient linked to a DIFFERENT entity. */
  @IsOptional()
  @IsBoolean()
  crossEntityConsentGranted?: boolean;
}
