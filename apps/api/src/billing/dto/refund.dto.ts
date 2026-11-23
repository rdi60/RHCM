import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"] as const;

export class CreateRefundDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  reason!: string;

  @IsIn(PAYMENT_MODES)
  mode!: (typeof PAYMENT_MODES)[number];
}

export class RefundActionDto {
  @IsString()
  entityId!: string;
}
