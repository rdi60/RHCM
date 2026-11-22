import { IsDateString, IsOptional, IsString } from "class-validator";

export class UpdateVisitClinicalDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  clinicalFindings?: string;

  @IsOptional()
  @IsString()
  diagnosisSummary?: string;

  @IsOptional()
  @IsString()
  treatmentAdvice?: string;

  @IsOptional()
  @IsDateString()
  nextAppointmentRecommendedAt?: string;
}
