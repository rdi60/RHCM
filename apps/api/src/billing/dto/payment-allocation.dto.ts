import { IsNumber, IsString, Min } from "class-validator";

export class CreateAllocationDto {
  @IsString()
  entityId!: string;

  @IsString()
  invoiceId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class ReverseAllocationDto {
  @IsString()
  entityId!: string;

  @IsString()
  reason!: string;
}
