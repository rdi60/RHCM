import { IsIn, IsString } from "class-validator";

const PLAN_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
const ITEM_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export class UpdateTreatmentPlanStatusDto {
  @IsString()
  entityId!: string;

  @IsIn(PLAN_STATUSES)
  status!: (typeof PLAN_STATUSES)[number];
}

export class UpdateTreatmentPlanItemStatusDto {
  @IsString()
  entityId!: string;

  @IsIn(ITEM_STATUSES)
  status!: (typeof ITEM_STATUSES)[number];
}
