import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"] as const;

export class CreatePaymentDto {
  @IsString()
  entityId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(PAYMENT_MODES)
  mode!: (typeof PAYMENT_MODES)[number];

  @IsOptional()
  @IsString()
  transactionReference?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  // Client-generated, e.g. a UUID minted once per submit — a retried
  // request with the same key returns the original payment/receipt
  // instead of creating a second one. See BillingService.recordPayment.
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
