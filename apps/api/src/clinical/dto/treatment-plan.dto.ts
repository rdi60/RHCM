import { Type } from "class-transformer";
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CreateTreatmentPlanItemDto {
  @IsOptional()
  @IsInt()
  toothNumber?: number;

  @IsString()
  treatmentCatalogId!: string;

  @IsOptional()
  @IsString()
  plannedDoctorId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;
}

export class CreateTreatmentPlanDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  // A plan may start with no items (items are then added one at a time via
  // POST /treatment-plans/:id/items) — not required to be non-empty.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTreatmentPlanItemDto)
  items!: CreateTreatmentPlanItemDto[];
}

export class AddTreatmentPlanItemDto extends CreateTreatmentPlanItemDto {
  @IsString()
  entityId!: string;
}
