import { IsIn, IsString } from "class-validator";

const STATUSES = [
  "BOOKED",
  "CONFIRMED",
  "ARRIVED",
  "CHECKED_IN",
  "WAITING",
  "IN_TREATMENT",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "RESCHEDULED",
] as const;

export class UpdateAppointmentStatusDto {
  @IsString()
  entityId!: string;

  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];
}
