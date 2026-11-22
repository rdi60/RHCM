import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateDiagnosisDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsInt()
  @Min(11)
  @Max(85)
  toothNumber?: number;

  @IsOptional()
  @IsString()
  diagnosisCode?: string;

  @IsString()
  description!: string;
}
