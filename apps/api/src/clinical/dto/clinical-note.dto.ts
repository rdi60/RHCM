import { IsOptional, IsString } from "class-validator";

export class CreateClinicalNoteDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  noteType?: string;

  @IsString()
  body!: string;
}

export class CreateAddendumDto {
  @IsString()
  entityId!: string;

  @IsString()
  body!: string;
}
