import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { StaffService } from "./staff.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { CreateStaffDto } from "./dto/create-staff.dto";
import { AssignEntityDto } from "./dto/assignment.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Staff")
@Controller("staff")
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @Get()
  list(@Query("entityId") entityId: string) {
    return this.staffService.listForEntity(entityId);
  }

  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @Post()
  create(@Body() dto: CreateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.staffService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @Post(":staffId/assignments")
  assign(@Param("staffId") staffId: string, @Body() dto: AssignEntityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.staffService.assign(staffId, dto.entityId, user.id);
  }

  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @Delete(":staffId/assignments/:entityId")
  unassign(@Param("staffId") staffId: string, @Param("entityId") entityId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffService.unassign(staffId, entityId, user.id);
  }
}
