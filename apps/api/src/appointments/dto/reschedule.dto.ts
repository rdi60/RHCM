import { IsDateString, IsOptional, IsString } from "class-validator";

export class RescheduleAppointmentDto {
  @IsString()
  entityId!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsString()
  resourceId?: string;
}
