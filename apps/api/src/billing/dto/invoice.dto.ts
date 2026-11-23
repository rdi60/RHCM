import { Type } from "class-transformer";
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CreateInvoiceItemDto {
  @IsOptional()
  @IsString()
  treatmentCatalogId?: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsInt()
  toothNumber?: number;

  @IsOptional()
  @IsString()
  plannedByDoctorId?: string;

  @IsOptional()
  @IsString()
  performedByDoctorId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  taxProfileId?: string;
}

export class CreateInvoiceDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items!: CreateInvoiceItemDto[];
}

export class ConvertEstimateItemSelectionDto {
  @IsString()
  estimateItemId!: string;

  // Omit to invoice the item's full remaining (unInvoiced) quantity.
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class ConvertEstimateToInvoiceDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConvertEstimateItemSelectionDto)
  selections!: ConvertEstimateItemSelectionDto[];
}

export class VoidInvoiceDto {
  @IsString()
  entityId!: string;

  @IsString()
  reason!: string;
}

export class CorrectInvoiceDto extends CreateInvoiceDto {
  @IsString()
  reason!: string;
}
