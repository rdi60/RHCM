import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AppointmentsService } from "./appointments.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { UpdateAppointmentStatusDto } from "./dto/update-status.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @RequirePermissions(PERMISSIONS.APPOINTMENT_READ)
  @Get("availability")
  availability(@Query("entityId") entityId: string, @Query("doctorId") doctorId: string, @Query("date") date: string) {
    return this.appointmentsService.getAvailability(entityId, doctorId, date);
  }

  @RequirePermissions(PERMISSIONS.APPOINTMENT_READ)
  @Get()
  list(
    @Query("entityId") entityId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("doctorId") doctorId?: string,
    @Query("resourceId") resourceId?: string,
    @Query("status") status?: string,
    @Query("patientId") patientId?: string,
  ) {
    return this.appointmentsService.listForRange({ entityId, from, to, doctorId, resourceId, status, patientId });
  }

  @RequirePermissions(PERMISSIONS.APPOINTMENT_BOOK)
  @Post()
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    const grant = user.access.find((a) => a.entityId === dto.entityId);
    return this.appointmentsService.create(dto, user.id, grant?.permissions ?? new Set());
  }

  @RequirePermissions(PERMISSIONS.APPOINTMENT_READ)
  @Get("for-temp-registration/:tempRegId")
  forTempRegistration(@Param("tempRegId") tempRegId: string, @Query("entityId") entityId: string) {
    return this.appointmentsService.listForTempRegistration(entityId, tempRegId);
  }

  @RequirePermissions(PERMISSIONS.APPOINTMENT_READ)
  @Get(":id")
  get(@Param("id") id: string, @Query("entityId") entityId: string) {
    return this.appointmentsService.getOne(id, entityId);
  }

  @RequirePermissions(PERMISSIONS.APPOINTMENT_BOOK)
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateAppointmentStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.updateStatus(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.APPOINTMENT_BOOK)
  @Post(":id/reschedule")
  reschedule(@Param("id") id: string, @Body() dto: RescheduleAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.reschedule(id, dto, user.id);
  }
}
