import { ArrayUnique, IsArray, IsOptional, IsString } from "class-validator";
import type { PermissionCode } from "@rhcm/shared";

export class CreateRoleDto {
  @IsString()
  entityId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  cloneFromRoleId?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionCodes!: PermissionCode[];
}
