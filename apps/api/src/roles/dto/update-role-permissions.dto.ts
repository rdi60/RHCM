import { ArrayUnique, IsArray, IsString } from "class-validator";
import type { PermissionCode } from "@rhcm/shared";

export class UpdateRolePermissionsDto {
  @IsString()
  entityId!: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionCodes!: PermissionCode[];
}
