import { IsArray, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateDoctorDto {
  @IsString()
  entityId!: string;

  @IsString()
  fullName!: string;

  @IsString()
  registrationNumber!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualifications?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultConsultationFee?: number;

  /** Optional: an existing user id to link a login to this doctor. A doctor does not need a login to be enrolled. */
  @IsOptional()
  @IsString()
  userId?: string;
}
