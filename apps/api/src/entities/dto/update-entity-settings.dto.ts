import { IsObject, IsOptional, IsString } from "class-validator";

export class UpdateEntitySettingsDto {
  @IsOptional()
  @IsObject()
  brandingJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  invoicePrefix?: string;

  @IsOptional()
  @IsString()
  receiptPrefix?: string;

  @IsOptional()
  @IsString()
  estimatePrefix?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsObject()
  addressJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  contactJson?: Record<string, unknown>;
}
