import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@rhcm/shared";
import { BillingService } from "./billing.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateCreditNoteDto, VoidCreditNoteDto } from "./dto/credit-note.dto";

@Controller()
export class CreditNotesController {
  constructor(private readonly billingService: BillingService) {}

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("patients/:patientId/credit-notes")
  list(@Param("patientId") patientId: string, @Query("entityId") entityId: string) {
    return this.billingService.listCreditNotes(patientId, entityId);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VOID)
  @Post("patients/:patientId/credit-notes")
  create(@Param("patientId") patientId: string, @Body() dto: CreateCreditNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createCreditNote(patientId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VOID)
  @Post("credit-notes/:id/void")
  void(@Param("id") id: string, @Body() dto: VoidCreditNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.voidCreditNote(id, dto, user.id);
  }
}
