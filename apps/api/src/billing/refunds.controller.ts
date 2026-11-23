import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@rhcm/shared";
import { BillingService } from "./billing.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateRefundDto, RefundActionDto } from "./dto/refund.dto";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Billing - Refunds")
@Controller()
export class RefundsController {
  constructor(private readonly billingService: BillingService) {}

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("patients/:patientId/refunds")
  list(@Param("patientId") patientId: string, @Query("entityId") entityId: string) {
    return this.billingService.listRefunds(patientId, entityId);
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_ALLOCATE)
  @Post("patients/:patientId/refunds")
  request(@Param("patientId") patientId: string, @Body() dto: CreateRefundDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.requestRefund(patientId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.REFUND_APPROVE)
  @Patch("refunds/:id/approve")
  approve(@Param("id") id: string, @Body() dto: RefundActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.approveRefund(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.REFUND_APPROVE)
  @Patch("refunds/:id/complete")
  complete(@Param("id") id: string, @Body() dto: RefundActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.completeRefund(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.REFUND_APPROVE)
  @Patch("refunds/:id/reject")
  reject(@Param("id") id: string, @Body() dto: RefundActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.rejectRefund(id, dto, user.id);
  }
}
