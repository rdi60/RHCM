import { Type } from "class-transformer";
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from "class-validator";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AvailabilitySlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsString()
  @Matches(HHMM)
  startTime!: string;

  @IsString()
  @Matches(HHMM)
  endTime!: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM)
  breakStart?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM)
  breakEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  slotDurationMinutes?: number;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class ReplaceAvailabilityDto {
  @IsString()
  entityId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  slots!: AvailabilitySlotDto[];
}

export class CreateDoctorLeaveDto {
  @IsString()
  entityId!: string;

  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
