import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class RequestDocumentUploadDto {
  @IsString()
  entityId!: string;

  @IsString()
  category!: string;

  @IsString()
  filename!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsString()
  treatmentSessionId?: string;
}

export class EntityScopedDto {
  @IsString()
  entityId!: string;
}
