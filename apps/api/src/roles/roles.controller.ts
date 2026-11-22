import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { RolesService } from "./roles.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions, SelfService } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @SelfService()
  @Get("permission-catalog")
  permissionCatalog() {
    return this.rolesService.permissionCatalog();
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Get()
  list(@Query("entityId") entityId: string) {
    return this.rolesService.listForEntity(entityId);
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.createCustomRole(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Patch(":roleId/permissions")
  updatePermissions(
    @Param("roleId") roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.updatePermissions(roleId, dto, user.id);
  }
}
