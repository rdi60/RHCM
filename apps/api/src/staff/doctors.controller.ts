import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { DoctorsService } from "./doctors.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { CreateDoctorDto } from "./dto/create-doctor.dto";
import { AssignEntityDto } from "./dto/assignment.dto";
import { ReplaceAvailabilityDto, CreateDoctorLeaveDto } from "./dto/availability.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

@Controller("doctors")
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @RequirePermissions(PERMISSIONS.DOCTOR_MANAGE)
  @Get()
  list(@Query("entityId") entityId: string) {
    return this.doctorsService.listForEntity(entityId);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("directory")
  directory(@Query("entityId") entityId: string) {
    return this.doctorsService.directory(entityId);
  }

  @RequirePermissions(PERMISSIONS.DOCTOR_MANAGE)
  @Post()
  create(@Body() dto: CreateDoctorDto, @CurrentUser() user: AuthenticatedUser) {
    return this.doctorsService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.DOCTOR_MANAGE)
  @Post(":doctorId/assignments")
  assign(@Param("doctorId") doctorId: string, @Body() dto: AssignEntityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.doctorsService.assign(doctorId, dto.entityId, user.id);
  }

  @RequirePermissions(PERMISSIONS.DOCTOR_MANAGE)
  @Delete(":doctorId/assignments/:entityId")
  unassign(@Param("doctorId") doctorId: string, @Param("entityId") entityId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.doctorsService.unassign(doctorId, entityId, user.id);
  }

  @RequirePermissions(PERMISSIONS.DOCTOR_MANAGE)
  @Get(":doctorId/availability")
  getAvailability(@Param("doctorId") doctorId: string, @Query("entityId") entityId: string) {
    return this.doctorsService.getAvailability(doctorId, entityId);
  }

  @RequirePermissions(PERMISSIONS.DOCTOR_MANAGE)
  @Put(":doctorId/availability")
  replaceAvailability(
    @Param("doctorId") doctorId: string,
    @Body() dto: ReplaceAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.doctorsService.replaceAvailability(doctorId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.DOCTOR_MANAGE)
  @Get(":doctorId/leave")
  listLeave(@Param("doctorId") doctorId: string, @Query("entityId") entityId: string) {
    return this.doctorsService.listLeave(doctorId, entityId);
  }

  @RequirePermissions(PERMISSIONS.DOCTOR_MANAGE)
  @Post(":doctorId/leave")
  createLeave(@Param("doctorId") doctorId: string, @Body() dto: CreateDoctorLeaveDto, @CurrentUser() user: AuthenticatedUser) {
    return this.doctorsService.createLeave(doctorId, dto, user.id);
  }
}
