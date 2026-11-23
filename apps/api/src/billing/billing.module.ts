import { Module } from "@nestjs/common";
import { PatientsModule } from "../patients/patients.module";
import { BillingService } from "./billing.service";
import { TaxProfilesController } from "./tax-profiles.controller";
import { EstimatesController } from "./estimates.controller";
import { InvoicesController } from "./invoices.controller";
import { PaymentsController } from "./payments.controller";
import { CreditNotesController } from "./credit-notes.controller";
import { RefundsController } from "./refunds.controller";

@Module({
  imports: [PatientsModule],
  controllers: [TaxProfilesController, EstimatesController, InvoicesController, PaymentsController, CreditNotesController, RefundsController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
