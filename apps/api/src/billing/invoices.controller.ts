import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@rhcm/shared";
import { BillingService } from "./billing.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { CorrectInvoiceDto, CreateInvoiceDto, VoidInvoiceDto } from "./dto/invoice.dto";

@Controller()
export class InvoicesController {
  constructor(private readonly billingService: BillingService) {}

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("patients/:patientId/invoices")
  list(@Param("patientId") patientId: string, @Query("entityId") entityId: string) {
    return this.billingService.listInvoices(patientId, entityId);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("invoices/:id")
  get(@Param("id") id: string, @Query("entityId") entityId: string) {
    return this.billingService.getInvoice(id, entityId);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_CREATE)
  @Post("patients/:patientId/invoices")
  create(@Param("patientId") patientId: string, @Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createInvoice(patientId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VOID)
  @Post("invoices/:id/void")
  void(@Param("id") id: string, @Body() dto: VoidInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.voidInvoice(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VOID)
  @Post("invoices/:id/correct")
  correct(@Param("id") id: string, @Body() dto: CorrectInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.correctInvoice(id, dto, user.id);
  }
}
