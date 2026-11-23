-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "tax_profiles" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "componentsJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_treatment_prices" (
    "entityId" TEXT NOT NULL,
    "treatmentCatalogId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_treatment_prices_pkey" PRIMARY KEY ("entityId","treatmentCatalogId")
);

-- CreateTable
CREATE TABLE "estimates" (
    "id" TEXT NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesEstimateId" TEXT,
    "validUntil" DATE,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "grossTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_items" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "treatmentPlanItemId" TEXT,
    "toothNumber" INTEGER,
    "plannedDoctorId" TEXT,
    "treatmentCatalogId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxProfileId" TEXT,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "invoicedQuantity" INTEGER NOT NULL DEFAULT 0,
    "invoicedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "estimate_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "grossTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "correctedByInvoiceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "estimateItemId" TEXT,
    "treatmentSessionId" TEXT,
    "toothNumber" INTEGER,
    "plannedByDoctorId" TEXT,
    "performedByDoctorId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxProfileId" TEXT,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "transactionReference" TEXT,
    "receivedById" TEXT,
    "remarks" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashierId" TEXT,
    "remarks" TEXT,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_profiles_entityId_name_key" ON "tax_profiles"("entityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_supersedesEstimateId_key" ON "estimates"("supersedesEstimateId");

-- CreateIndex
CREATE INDEX "estimates_patientId_idx" ON "estimates"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_entityId_estimateNumber_key" ON "estimates"("entityId", "estimateNumber");

-- CreateIndex
CREATE INDEX "estimate_items_estimateId_idx" ON "estimate_items"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_correctedByInvoiceId_key" ON "invoices"("correctedByInvoiceId");

-- CreateIndex
CREATE INDEX "invoices_patientId_idx" ON "invoices"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_entityId_invoiceNumber_key" ON "invoices"("entityId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_entityId_patientId_idx" ON "payments"("entityId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_paymentId_key" ON "receipts"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_entityId_receiptNumber_key" ON "receipts"("entityId", "receiptNumber");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_patientId_idx" ON "credit_notes"("patientId");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "refunds_patientId_idx" ON "refunds"("patientId");

-- AddForeignKey
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_treatment_prices" ADD CONSTRAINT "entity_treatment_prices_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_treatment_prices" ADD CONSTRAINT "entity_treatment_prices_treatmentCatalogId_fkey" FOREIGN KEY ("treatmentCatalogId") REFERENCES "treatment_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_supersedesEstimateId_fkey" FOREIGN KEY ("supersedesEstimateId") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_treatmentPlanItemId_fkey" FOREIGN KEY ("treatmentPlanItemId") REFERENCES "treatment_plan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_plannedDoctorId_fkey" FOREIGN KEY ("plannedDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_treatmentCatalogId_fkey" FOREIGN KEY ("treatmentCatalogId") REFERENCES "treatment_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "tax_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_correctedByInvoiceId_fkey" FOREIGN KEY ("correctedByInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_estimateItemId_fkey" FOREIGN KEY ("estimateItemId") REFERENCES "estimate_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_treatmentSessionId_fkey" FOREIGN KEY ("treatmentSessionId") REFERENCES "treatment_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_plannedByDoctorId_fkey" FOREIGN KEY ("plannedByDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_performedByDoctorId_fkey" FOREIGN KEY ("performedByDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "tax_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written: CHECK constraints the Prisma schema can't express directly.
-- ---------------------------------------------------------------------------

ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_quantity_positive_check" CHECK ("quantity" > 0);
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_invoiced_qty_check" CHECK ("invoicedQuantity" >= 0 AND "invoicedQuantity" <= "quantity");
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_invoiced_amount_check" CHECK ("invoicedAmount" >= 0 AND "invoicedAmount" <= "lineTotal");

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_quantity_positive_check" CHECK ("quantity" > 0);

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_rate_range_check" CHECK ("rate" >= 0 AND "rate" <= 100);

-- ---------------------------------------------------------------------------
-- Hand-written: trigger functions enforcing allocation limits and keeping
-- invoices.paidAmount/status in sync. These require cross-row SUM
-- aggregation, which a plain CHECK constraint cannot express, so — same
-- pattern as the Stage 3 GIST exclusion constraints — they're appended here
-- rather than generated by `prisma migrate diff`.
--
-- Defense in depth: PaymentsService/PaymentAllocationService also run their
-- writes inside a single DB transaction with the same checks, but these
-- triggers are the backstop that holds even if a future code path forgets to.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recompute_invoice_paid_amount(p_invoice_id TEXT) RETURNS VOID AS $$
DECLARE
  v_invoice_net NUMERIC(12,2);
  v_status TEXT;
  v_sum NUMERIC(12,2);
BEGIN
  SELECT "netTotal", "status" INTO v_invoice_net, v_status FROM "invoices" WHERE "id" = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM("amount"), 0) INTO v_sum
    FROM "payment_allocations"
    WHERE "invoiceId" = p_invoice_id AND "reversedAt" IS NULL;

  UPDATE "invoices"
  SET "paidAmount" = v_sum,
      "status" = CASE
        WHEN "status" = 'VOID' THEN "status"
        WHEN v_sum >= v_invoice_net AND v_invoice_net > 0 THEN 'PAID'
        WHEN v_sum > 0 THEN 'PARTIALLY_PAID'
        WHEN "status" IN ('PAID', 'PARTIALLY_PAID') THEN 'ISSUED'
        ELSE "status"
      END
  WHERE "id" = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_payment_allocation() RETURNS TRIGGER AS $$
DECLARE
  v_invoice_entity TEXT;
  v_payment_entity TEXT;
  v_invoice_net NUMERIC(12,2);
  v_payment_amount NUMERIC(12,2);
  v_sum_invoice NUMERIC(12,2);
  v_sum_payment NUMERIC(12,2);
BEGIN
  SELECT "entityId", "netTotal" INTO v_invoice_entity, v_invoice_net
    FROM "invoices" WHERE "id" = NEW."invoiceId" FOR UPDATE;
  SELECT "entityId", "amount" INTO v_payment_entity, v_payment_amount
    FROM "payments" WHERE "id" = NEW."paymentId" FOR UPDATE;

  IF v_invoice_entity IS DISTINCT FROM v_payment_entity THEN
    RAISE EXCEPTION 'payment_allocation_cross_entity: payment entity % does not match invoice entity %', v_payment_entity, v_invoice_entity;
  END IF;

  SELECT COALESCE(SUM("amount"), 0) INTO v_sum_invoice
    FROM "payment_allocations" WHERE "invoiceId" = NEW."invoiceId" AND "reversedAt" IS NULL;
  IF v_sum_invoice > v_invoice_net THEN
    RAISE EXCEPTION 'payment_allocation_exceeds_invoice: allocated % exceeds invoice net total %', v_sum_invoice, v_invoice_net;
  END IF;

  SELECT COALESCE(SUM("amount"), 0) INTO v_sum_payment
    FROM "payment_allocations" WHERE "paymentId" = NEW."paymentId" AND "reversedAt" IS NULL;
  IF v_sum_payment > v_payment_amount THEN
    RAISE EXCEPTION 'payment_allocation_exceeds_payment: allocated % exceeds payment amount %', v_sum_payment, v_payment_amount;
  END IF;

  PERFORM recompute_invoice_paid_amount(NEW."invoiceId");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_allocation_insupd
AFTER INSERT OR UPDATE ON "payment_allocations"
FOR EACH ROW EXECUTE FUNCTION enforce_payment_allocation();

CREATE OR REPLACE FUNCTION enforce_payment_allocation_delete() RETURNS TRIGGER AS $$
BEGIN
  PERFORM recompute_invoice_paid_amount(OLD."invoiceId");
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_allocation_del
AFTER DELETE ON "payment_allocations"
FOR EACH ROW EXECUTE FUNCTION enforce_payment_allocation_delete();

-- Refunds linked to a specific payment can never, once COMPLETED, total more
-- than that payment's amount.
CREATE OR REPLACE FUNCTION enforce_refund_amount() RETURNS TRIGGER AS $$
DECLARE
  v_payment_amount NUMERIC(12,2);
  v_sum NUMERIC(12,2);
BEGIN
  IF NEW."paymentId" IS NULL OR NEW."status" <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  SELECT "amount" INTO v_payment_amount FROM "payments" WHERE "id" = NEW."paymentId" FOR UPDATE;
  SELECT COALESCE(SUM("amount"), 0) INTO v_sum
    FROM "refunds" WHERE "paymentId" = NEW."paymentId" AND "status" = 'COMPLETED';

  IF v_sum > v_payment_amount THEN
    RAISE EXCEPTION 'refund_exceeds_payment: refunded % exceeds payment amount %', v_sum, v_payment_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refund_amount
AFTER INSERT OR UPDATE ON "refunds"
FOR EACH ROW EXECUTE FUNCTION enforce_refund_amount();
