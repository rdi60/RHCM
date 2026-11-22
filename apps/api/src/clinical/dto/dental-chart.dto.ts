import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const DENTITIONS = ["PERMANENT", "DECIDUOUS"] as const;

export class CreateDentalChartEntryDto {
  @IsString()
  entityId!: string;

  // Coarse bound only (FDI quadrant/position has gaps a simple range can't
  // express, e.g. 19 and 29 aren't valid teeth) — the frontend's fixed
  // tooth picker is what actually constrains this to real FDI numbers.
  @IsInt()
  @Min(11)
  @Max(85)
  toothNumber!: number;

  @IsOptional()
  @IsIn(DENTITIONS)
  dentition?: (typeof DENTITIONS)[number];

  @IsOptional()
  @IsString()
  surface?: string;

  @IsString()
  condition!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  visitId?: string;
}
