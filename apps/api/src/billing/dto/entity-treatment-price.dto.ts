import { IsNumber, IsString, Min } from "class-validator";

export class UpsertEntityTreatmentPriceDto {
  @IsString()
  entityId!: string;

  @IsString()
  treatmentCatalogId!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}
