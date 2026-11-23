import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateTaxProfileDto {
  @IsString()
  entityId!: string;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  rate!: number;

  @IsOptional()
  @IsObject()
  componentsJson?: Record<string, number>;
}

export class UpdateTaxProfileDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rate?: number;

  @IsOptional()
  @IsObject()
  componentsJson?: Record<string, number>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
