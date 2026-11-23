import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateCreditNoteDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  reason!: string;
}

export class VoidCreditNoteDto {
  @IsString()
  entityId!: string;
}
