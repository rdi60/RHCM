import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ClinicalService } from "./clinical.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { AddTreatmentPlanItemDto, CreateTreatmentPlanDto } from "./dto/treatment-plan.dto";
import { UpdateTreatmentPlanItemStatusDto, UpdateTreatmentPlanStatusDto } from "./dto/treatment-plan-status.dto";
import { CreateTreatmentSessionDto, UpdateTreatmentSessionDto } from "./dto/treatment-session.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

@Controller()
export class TreatmentPlansController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @RequirePermissions(PERMISSIONS.CLINICAL_READ)
  @Get("patients/:patientId/treatment-plans")
  list(@Param("patientId") patientId: string, @Query("entityId") entityId: string) {
    return this.clinicalService.listTreatmentPlans(patientId, entityId);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_PLAN_TREATMENT)
  @Post("patients/:patientId/treatment-plans")
  create(@Param("patientId") patientId: string, @Body() dto: CreateTreatmentPlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.createTreatmentPlan(patientId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_PLAN_TREATMENT)
  @Patch("treatment-plans/:planId/status")
  updatePlanStatus(@Param("planId") planId: string, @Body() dto: UpdateTreatmentPlanStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.updateTreatmentPlanStatus(planId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_PLAN_TREATMENT)
  @Post("treatment-plans/:planId/items")
  addItem(@Param("planId") planId: string, @Body() dto: AddTreatmentPlanItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.addTreatmentPlanItem(planId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_PLAN_TREATMENT)
  @Patch("treatment-plan-items/:itemId/status")
  updateItemStatus(@Param("itemId") itemId: string, @Body() dto: UpdateTreatmentPlanItemStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.updateTreatmentPlanItemStatus(itemId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_PLAN_TREATMENT)
  @Post("treatment-plan-items/:itemId/sessions")
  createSession(@Param("itemId") itemId: string, @Body() dto: CreateTreatmentSessionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.createTreatmentSession(itemId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_PERFORM_TREATMENT)
  @Patch("treatment-sessions/:sessionId")
  updateSession(@Param("sessionId") sessionId: string, @Body() dto: UpdateTreatmentSessionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.updateTreatmentSession(sessionId, dto, user.id);
  }
}
