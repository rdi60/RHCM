import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ClinicalService } from "./clinical.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { CreateDentalChartEntryDto } from "./dto/dental-chart.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Clinical - Dental Chart")
@Controller("patients/:patientId/dental-chart")
export class DentalChartController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @RequirePermissions(PERMISSIONS.CLINICAL_READ)
  @Get()
  list(@Param("patientId") patientId: string, @Query("entityId") entityId: string) {
    return this.clinicalService.listDentalChart(patientId, entityId);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_DIAGNOSE)
  @Post()
  create(@Param("patientId") patientId: string, @Body() dto: CreateDentalChartEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.createDentalChartEntry(patientId, dto, user.id);
  }
}
