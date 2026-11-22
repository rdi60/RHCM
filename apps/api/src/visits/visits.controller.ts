import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { VisitsService } from "./visits.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { UpdateVisitStatusDto } from "./dto/update-visit-status.dto";
import { AssignVisitDto } from "./dto/assign-visit.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

@Controller("visits")
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @RequirePermissions(PERMISSIONS.APPOINTMENT_READ)
  @Get()
  list(@Query("entityId") entityId: string, @Query("status") status?: string, @Query("date") date?: string) {
    return this.visitsService.listForEntity(entityId, { status, date });
  }

  @RequirePermissions(PERMISSIONS.APPOINTMENT_READ)
  @Get(":id")
  get(@Param("id") id: string, @Query("entityId") entityId: string) {
    return this.visitsService.getOne(id, entityId);
  }

  @RequirePermissions(PERMISSIONS.APPOINTMENT_BOOK)
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateVisitStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.updateStatus(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.APPOINTMENT_BOOK)
  @Patch(":id/assign")
  assign(@Param("id") id: string, @Body() dto: AssignVisitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.assign(id, dto, user.id);
  }
}
