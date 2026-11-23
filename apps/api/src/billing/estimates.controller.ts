import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@rhcm/shared";
import { BillingService } from "./billing.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateEstimateDto, UpdateEstimateStatusDto } from "./dto/estimate.dto";
import { ConvertEstimateToInvoiceDto } from "./dto/invoice.dto";

@Controller()
export class EstimatesController {
  constructor(private readonly billingService: BillingService) {}

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("patients/:patientId/estimates")
  list(@Param("patientId") patientId: string, @Query("entityId") entityId: string) {
    return this.billingService.listEstimates(patientId, entityId);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("estimates/:id")
  get(@Param("id") id: string, @Query("entityId") entityId: string) {
    return this.billingService.getEstimate(id, entityId);
  }

  @RequirePermissions(PERMISSIONS.ESTIMATE_CREATE)
  @Post("patients/:patientId/estimates")
  create(@Param("patientId") patientId: string, @Body() dto: CreateEstimateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createEstimate(patientId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ESTIMATE_APPROVE)
  @Patch("estimates/:id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateEstimateStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.updateEstimateStatus(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ESTIMATE_CREATE)
  @Post("estimates/:id/revise")
  revise(@Param("id") id: string, @Body() dto: CreateEstimateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.reviseEstimate(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_CREATE)
  @Post("estimates/:id/invoices")
  convertToInvoice(@Param("id") id: string, @Body() dto: ConvertEstimateToInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.convertEstimateToInvoice(id, dto, user.id);
  }
}
