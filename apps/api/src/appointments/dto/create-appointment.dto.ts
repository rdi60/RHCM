import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, ValidateIf } from "class-validator";

const TYPES = ["CONSULTATION", "TREATMENT", "FOLLOW_UP", "EMERGENCY"] as const;

export class CreateAppointmentDto {
  @IsString()
  entityId!: string;

  @ValidateIf((o) => !o.temporaryRegistrationId)
  @IsString()
  patientId?: string;

  @ValidateIf((o) => !o.patientId)
  @IsString()
  temporaryRegistrationId?: string;

  @IsString()
  doctorId!: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsIn(TYPES)
  type?: (typeof TYPES)[number];

  @IsOptional()
  @IsString()
  procedureHint?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  /** Only honored when the appointment type is EMERGENCY and the caller holds appointment.override_conflict. */
  @IsOptional()
  @IsBoolean()
  overrideConflict?: boolean;
}
