import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@rhcm/shared";
import { BillingService } from "./billing.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreatePaymentDto } from "./dto/payment.dto";
import { CreateAllocationDto, ReverseAllocationDto } from "./dto/payment-allocation.dto";

@Controller()
export class PaymentsController {
  constructor(private readonly billingService: BillingService) {}

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("patients/:patientId/payments")
  list(@Param("patientId") patientId: string, @Query("entityId") entityId: string) {
    return this.billingService.listPayments(patientId, entityId);
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_RECEIVE)
  @Post("patients/:patientId/payments")
  record(@Param("patientId") patientId: string, @Body() dto: CreatePaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.recordPayment(patientId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("payments/:id/receipt")
  receipt(@Param("id") id: string, @Query("entityId") entityId: string) {
    return this.billingService.getReceiptForPayment(id, entityId);
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_ALLOCATE)
  @Post("payments/:id/allocations")
  allocate(@Param("id") id: string, @Body() dto: CreateAllocationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createAllocation(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_ALLOCATE)
  @Post("payment-allocations/:id/reverse")
  reverseAllocation(@Param("id") id: string, @Body() dto: ReverseAllocationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.reverseAllocation(id, dto, user.id);
  }
}
