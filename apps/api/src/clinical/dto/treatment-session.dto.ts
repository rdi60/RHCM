import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

const SESSION_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export class CreateTreatmentSessionDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsInt()
  toothNumber?: number;

  @IsOptional()
  @IsString()
  procedureCode?: string;

  @IsOptional()
  @IsString()
  assignedDoctorId?: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;
}

export class UpdateTreatmentSessionDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsIn(SESSION_STATUSES)
  status?: (typeof SESSION_STATUSES)[number];

  @IsOptional()
  @IsString()
  performedByDoctorId?: string;

  @IsOptional()
  @IsDateString()
  actualDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualBilledAmount?: number;

  @IsOptional()
  @IsString()
  clinicalRemarks?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assistantStaffIds?: string[];
}
