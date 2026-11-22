import { IsIn, IsString } from "class-validator";

const STATUSES = ["WAITING", "IN_TREATMENT", "COMPLETED", "CANCELLED"] as const;

export class UpdateVisitStatusDto {
  @IsString()
  entityId!: string;

  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];
}
