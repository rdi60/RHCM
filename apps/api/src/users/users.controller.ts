import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UsersService } from "./users.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireGlobalPermissions, RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { CreateUserDto } from "./dto/create-user.dto";
import { GrantAccessDto } from "./dto/grant-access.dto";
import { SetStatusDto } from "./dto/set-status.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Get()
  list(@Query("entityId") entityId: string) {
    return this.usersService.listForEntity(entityId);
  }

  @RequireGlobalPermissions(PERMISSIONS.USER_MANAGE)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.create(dto, user.id);
  }

  @RequireGlobalPermissions(PERMISSIONS.USER_MANAGE)
  @Patch(":userId/status")
  setStatus(@Param("userId") userId: string, @Body() dto: SetStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.setStatus(userId, dto.status, user.id);
  }

  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Post(":userId/access")
  grantAccess(@Param("userId") userId: string, @Body() dto: GrantAccessDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.grantAccess(userId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Delete("access/:accessId")
  revokeAccess(
    @Param("accessId") accessId: string,
    @Query("entityId") entityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.revokeAccess(accessId, entityId, user.id);
  }
}
