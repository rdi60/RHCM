import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { CreateTempRegistrationDto } from "./dto/create-temp-registration.dto";
import { UpdateTempRegistrationDto } from "./dto/update-temp-registration.dto";
import { CheckInDto } from "./dto/check-in.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

@Controller("temp-registrations")
export class TempRegistrationsController {
  constructor(private readonly patientsService: PatientsService) {}

  @RequirePermissions(PERMISSIONS.PATIENT_REGISTER)
  @Post()
  create(@Body() dto: CreateTempRegistrationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.createTempRegistration(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get()
  list(@Query("entityId") entityId: string, @Query("status") status?: string) {
    return this.patientsService.listTempRegistrations(entityId, status);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get(":id")
  get(@Param("id") id: string, @Query("entityId") entityId: string) {
    return this.patientsService.getTempRegistration(id, entityId);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_REGISTER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTempRegistrationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.updateTempRegistration(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_CHECK_IN)
  @Post(":id/check-in")
  checkIn(@Param("id") id: string, @Body() dto: CheckInDto, @CurrentUser() user: AuthenticatedUser) {
    const grant = user.access.find((a) => a.entityId === dto.entityId);
    const hasCrossEntityPermission = grant?.permissions.has(PERMISSIONS.PATIENT_CROSS_ENTITY_LINK) ?? false;
    return this.patientsService.checkIn(id, dto, user.id, hasCrossEntityPermission);
  }
}
