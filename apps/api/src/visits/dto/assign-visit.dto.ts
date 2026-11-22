import { IsOptional, IsString } from "class-validator";

export class AssignVisitDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;
}
