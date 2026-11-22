import { IsOptional, IsString } from "class-validator";

export class CreateStaffDto {
  @IsString()
  entityId!: string;

  @IsString()
  fullName!: string;

  @IsString()
  designation!: string;

  @IsString()
  employeeCode!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
