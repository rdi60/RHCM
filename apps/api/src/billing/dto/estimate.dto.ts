import { Type } from "class-transformer";
import { IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CreateEstimateItemDto {
  @IsOptional()
  @IsString()
  treatmentPlanItemId?: string;

  @IsOptional()
  @IsInt()
  toothNumber?: number;

  @IsOptional()
  @IsString()
  plannedDoctorId?: string;

  @IsString()
  treatmentCatalogId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  // Omit to default from the catalog's entity price (or its global default price).
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  taxProfileId?: string;
}

export class CreateEstimateDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEstimateItemDto)
  items!: CreateEstimateItemDto[];
}

export class UpdateEstimateStatusDto {
  @IsString()
  entityId!: string;

  @IsString()
  status!: "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
}
