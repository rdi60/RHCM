import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@rhcm/shared";
import { ConsentService } from "./consent.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateConsentRecordDto } from "./dto/consent.dto";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Consent")
@Controller()
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("patients/:patientId/consents")
  list(@Param("patientId") patientId: string, @Query("entityId") entityId: string) {
    return this.consentService.listForPatient(patientId, entityId);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_CONSENT_MANAGE)
  @Post("patients/:patientId/consents")
  create(@Param("patientId") patientId: string, @Body() dto: CreateConsentRecordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.consentService.create(patientId, dto, user.id);
  }
}
