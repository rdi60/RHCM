import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, nextEstimateNumber, nextInvoiceNumber, nextReceiptNumber } from "@rhcm/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PatientsService } from "../patients/patients.service";
import type { CreateTaxProfileDto, UpdateTaxProfileDto } from "./dto/tax-profile.dto";
import type { UpsertEntityTreatmentPriceDto } from "./dto/entity-treatment-price.dto";
import type { CreateEstimateDto, UpdateEstimateStatusDto } from "./dto/estimate.dto";
import type { ConvertEstimateToInvoiceDto, CorrectInvoiceDto, CreateInvoiceDto, VoidInvoiceDto } from "./dto/invoice.dto";
import type { CreatePaymentDto } from "./dto/payment.dto";
import type { CreateAllocationDto, ReverseAllocationDto } from "./dto/payment-allocation.dto";
import type { CreateCreditNoteDto, VoidCreditNoteDto } from "./dto/credit-note.dto";
import type { CreateRefundDto, RefundActionDto } from "./dto/refund.dto";

const ESTIMATE_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT", "REJECTED", "EXPIRED"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  SUPERSEDED: [],
  CONVERTED: [],
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly patientsService: PatientsService,
  ) {}

  // --- Shared helpers -----------------------------------------------------

  private async getOwnVisit(visitId: string, entityId: string) {
    const visit = await this.prisma.client.visit.findUnique({ where: { id: visitId } });
    if (!visit || visit.entityId !== entityId) throw new BadRequestException("visitId does not belong to this entity");
    return visit;
  }

  private async resolveUnitPrice(entityId: string, treatmentCatalogId: string | undefined, unitPriceInput: number | undefined) {
    if (unitPriceInput !== undefined) return new Prisma.Decimal(unitPriceInput);
    if (!treatmentCatalogId) {
      throw new BadRequestException("unitPrice is required when treatmentCatalogId is not given");
    }
    const override = await this.prisma.client.entityTreatmentPrice.findUnique({
      where: { entityId_treatmentCatalogId: { entityId, treatmentCatalogId } },
    });
    if (override) return override.price;
    const catalog = await this.prisma.client.treatmentCatalog.findUnique({ where: { id: treatmentCatalogId } });
    if (!catalog) throw new BadRequestException("Unknown treatmentCatalogId");
    return catalog.defaultPrice;
  }

  private async getTaxRate(taxProfileId: string | null | undefined) {
    if (!taxProfileId) return new Prisma.Decimal(0);
    const profile = await this.prisma.client.taxProfile.findUnique({ where: { id: taxProfileId } });
    if (!profile) throw new BadRequestException("Unknown taxProfileId");
    return profile.rate;
  }

  /**
   * Prices a set of raw line items (from an Estimate or Invoice create DTO)
   * into Decimal-exact figures, and aggregates the document's totals. Every
   * amount is computed with decimal.js (via Prisma.Decimal) rather than JS
   * floats, so summing many lines never drifts by a paisa.
   *
   * lineTotal is always PRE-tax (gross - discount); tax is tracked
   * separately in the aggregate totals — see the Invoice/EstimateItem doc
   * comments in schema.prisma for why no per-item tax column exists.
   */
  private async priceLineItems(entityId: string, rawItems: any[]) {
    let gross = new Prisma.Decimal(0);
    let discount = new Prisma.Decimal(0);
    let tax = new Prisma.Decimal(0);
    let net = new Prisma.Decimal(0);

    const priced = await Promise.all(
      rawItems.map(async (raw) => {
        const quantity = raw.quantity ?? 1;
        const unitPrice = await this.resolveUnitPrice(entityId, raw.treatmentCatalogId, raw.unitPrice);
        const discountAmount = new Prisma.Decimal(raw.discountAmount ?? 0);
        const lineGross = unitPrice.mul(quantity);
        const lineTotal = lineGross.sub(discountAmount);
        if (lineTotal.isNegative()) {
          throw new BadRequestException("discountAmount cannot exceed the line's gross amount");
        }
        const rate = await this.getTaxRate(raw.taxProfileId);
        const lineTax = lineTotal.mul(rate).div(100);

        gross = gross.add(lineGross);
        discount = discount.add(discountAmount);
        tax = tax.add(lineTax);
        net = net.add(lineTotal).add(lineTax);

        return { ...raw, quantity, unitPrice, discountAmount, lineTotal };
      }),
    );

    return { priced, totals: { gross, discount, tax, net } };
  }

  /** Maps a DB CHECK-constraint/trigger violation to a client-facing 400; anything else is rethrown as-is. */
  private rethrowAsIntegrityError(e: unknown): never {
    if (e instanceof BadRequestException || e instanceof NotFoundException) throw e;
    const message = e instanceof Error ? e.message : String(e);
    if (/violates check constraint|payment_allocation_cross_entity|payment_allocation_exceeds|refund_exceeds_payment/i.test(message)) {
      // Prisma wraps the raw Postgres error (our RAISE EXCEPTION text, or a
      // CHECK constraint name) inside a verbose multi-line/connector-error
      // string — pull out just the `message: "..."` Postgres gave us, or
      // fall back to the last non-empty line if that shape doesn't match.
      const pgMessage = message.match(/message:\s*"([^"]+)"/)?.[1];
      const lines = message.split("\n").map((l) => l.trim()).filter(Boolean);
      throw new BadRequestException(`Billing integrity rule violated: ${pgMessage ?? lines[lines.length - 1] ?? message}`);
    }
    throw e as Error;
  }

  private isUniqueViolation(e: unknown): boolean {
    return e instanceof Error && /unique constraint/i.test(e.message);
  }

  // --- Tax profiles / entity treatment prices ------------------------------

  async listTaxProfiles(entityId: string) {
    return this.prisma.client.taxProfile.findMany({ where: { entityId }, orderBy: { name: "asc" } });
  }

  async createTaxProfile(dto: CreateTaxProfileDto, actorUserId: string) {
    const profile = await this.prisma.client.taxProfile.create({
      data: { entityId: dto.entityId, name: dto.name, rate: new Prisma.Decimal(dto.rate), componentsJson: dto.componentsJson as any },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.tax_profile_created",
      resourceType: "tax_profile",
      resourceId: profile.id,
      after: { name: dto.name, rate: dto.rate },
    });
    return profile;
  }

  async updateTaxProfile(id: string, dto: UpdateTaxProfileDto, actorUserId: string) {
    const existing = await this.prisma.client.taxProfile.findUnique({ where: { id } });
    if (!existing || existing.entityId !== dto.entityId) throw new NotFoundException("Tax profile not found for this entity");
    const updated = await this.prisma.client.taxProfile.update({
      where: { id },
      data: {
        rate: dto.rate !== undefined ? new Prisma.Decimal(dto.rate) : undefined,
        componentsJson: dto.componentsJson as any,
        isActive: dto.isActive,
      },
    });
    await this.audit.record({ actorUserId, entityId: dto.entityId, action: "billing.tax_profile_updated", resourceType: "tax_profile", resourceId: id });
    return updated;
  }

  async listEntityTreatmentPrices(entityId: string) {
    return this.prisma.client.entityTreatmentPrice.findMany({ where: { entityId }, include: { treatmentCatalog: true } });
  }

  async upsertEntityTreatmentPrice(dto: UpsertEntityTreatmentPriceDto, actorUserId: string) {
    const price = await this.prisma.client.entityTreatmentPrice.upsert({
      where: { entityId_treatmentCatalogId: { entityId: dto.entityId, treatmentCatalogId: dto.treatmentCatalogId } },
      create: { entityId: dto.entityId, treatmentCatalogId: dto.treatmentCatalogId, price: new Prisma.Decimal(dto.price) },
      update: { price: new Prisma.Decimal(dto.price) },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.entity_treatment_price_set",
      resourceType: "entity_treatment_price",
      resourceId: `${dto.entityId}:${dto.treatmentCatalogId}`,
      after: { price: dto.price },
    });
    return price;
  }

  // --- Estimates ------------------------------------------------------------

  async listEstimates(patientId: string, entityId: string) {
    await this.patientsService.getPatient(patientId, entityId);
    return this.prisma.client.estimate.findMany({
      where: { patientId, entityId },
      include: { items: { include: { treatmentCatalog: true, taxProfile: true, plannedDoctor: { select: { id: true, fullName: true } } } } },
      orderBy: { createdAt: "desc" },
    });
  }

  private async getOwnEstimate(estimateId: string, entityId: string) {
    const estimate = await this.prisma.client.estimate.findUnique({ where: { id: estimateId }, include: { items: true } });
    if (!estimate || estimate.entityId !== entityId) throw new NotFoundException("Estimate not found for this entity");
    return estimate;
  }

  async getEstimate(estimateId: string, entityId: string) {
    return this.getOwnEstimate(estimateId, entityId);
  }

  async createEstimate(patientId: string, dto: CreateEstimateDto, actorUserId: string) {
    await this.patientsService.getPatient(patientId, dto.entityId);
    if (dto.visitId) await this.getOwnVisit(dto.visitId, dto.entityId);
    if (dto.items.length === 0) throw new BadRequestException("An estimate needs at least one item");

    const { priced, totals } = await this.priceLineItems(dto.entityId, dto.items);

    const estimate = await this.prisma.client.$transaction(async (tx) => {
      const estimateNumber = await nextEstimateNumber(tx, dto.entityId);
      return tx.estimate.create({
        data: {
          estimateNumber,
          entityId: dto.entityId,
          patientId,
          visitId: dto.visitId,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          createdById: actorUserId,
          grossTotal: totals.gross,
          discountTotal: totals.discount,
          taxTotal: totals.tax,
          netTotal: totals.net,
          items: {
            create: priced.map((p) => ({
              treatmentPlanItemId: p.treatmentPlanItemId as string | undefined,
              toothNumber: p.toothNumber as number | undefined,
              plannedDoctorId: p.plannedDoctorId as string | undefined,
              treatmentCatalogId: p.treatmentCatalogId!,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              discountAmount: p.discountAmount,
              taxProfileId: p.taxProfileId as string | undefined,
              lineTotal: p.lineTotal,
            })),
          },
        },
        include: { items: true },
      });
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.estimate_created",
      resourceType: "estimate",
      resourceId: estimate.id,
      after: { estimateNumber: estimate.estimateNumber, netTotal: estimate.netTotal.toString() },
    });
    return estimate;
  }

  async updateEstimateStatus(estimateId: string, dto: UpdateEstimateStatusDto, actorUserId: string) {
    const estimate = await this.getOwnEstimate(estimateId, dto.entityId);
    const allowed = ESTIMATE_ALLOWED_TRANSITIONS[estimate.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot move estimate from ${estimate.status} to ${dto.status}`);
    }
    const updated = await this.prisma.client.estimate.update({ where: { id: estimateId }, data: { status: dto.status as any } });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.estimate_status_changed",
      resourceType: "estimate",
      resourceId: estimateId,
      after: { status: dto.status },
    });
    return updated;
  }

  async reviseEstimate(estimateId: string, dto: CreateEstimateDto, actorUserId: string) {
    const original = await this.getOwnEstimate(estimateId, dto.entityId);
    if (original.status === "CONVERTED" || original.status === "SUPERSEDED") {
      throw new BadRequestException(`Cannot revise an estimate in ${original.status} status`);
    }
    if (dto.items.length === 0) throw new BadRequestException("An estimate needs at least one item");

    const { priced, totals } = await this.priceLineItems(dto.entityId, dto.items);

    const revised = await this.prisma.client.$transaction(async (tx) => {
      const estimateNumber = await nextEstimateNumber(tx, dto.entityId);
      const next = await tx.estimate.create({
        data: {
          estimateNumber,
          entityId: dto.entityId,
          patientId: original.patientId,
          visitId: dto.visitId ?? original.visitId,
          version: original.version + 1,
          supersedesEstimateId: original.id,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : original.validUntil,
          createdById: actorUserId,
          grossTotal: totals.gross,
          discountTotal: totals.discount,
          taxTotal: totals.tax,
          netTotal: totals.net,
          items: {
            create: priced.map((p) => ({
              treatmentPlanItemId: p.treatmentPlanItemId as string | undefined,
              toothNumber: p.toothNumber as number | undefined,
              plannedDoctorId: p.plannedDoctorId as string | undefined,
              treatmentCatalogId: p.treatmentCatalogId!,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              discountAmount: p.discountAmount,
              taxProfileId: p.taxProfileId as string | undefined,
              lineTotal: p.lineTotal,
            })),
          },
        },
        include: { items: true },
      });
      await tx.estimate.update({ where: { id: original.id }, data: { status: "SUPERSEDED" } });
      return next;
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.estimate_revised",
      resourceType: "estimate",
      resourceId: revised.id,
      after: { supersedesEstimateId: original.id, version: revised.version },
    });
    return revised;
  }

  // --- Invoices ---------------------------------------------------------------

  async listInvoices(patientId: string, entityId: string) {
    await this.patientsService.getPatient(patientId, entityId);
    return this.prisma.client.invoice.findMany({
      where: { patientId, entityId },
      include: { items: true },
      orderBy: { invoiceDate: "desc" },
    });
  }

  private async getOwnInvoice(invoiceId: string, entityId: string, include?: any) {
    const invoice = await this.prisma.client.invoice.findUnique({ where: { id: invoiceId }, include });
    if (!invoice || invoice.entityId !== entityId) throw new NotFoundException("Invoice not found for this entity");
    return invoice;
  }

  async getInvoice(invoiceId: string, entityId: string) {
    const invoice = await this.getOwnInvoice(invoiceId, entityId, {
      items: true,
      paymentAllocations: { where: { reversedAt: null } },
      creditNotes: { where: { status: "ISSUED" } },
    });
    const allocated = invoice.paymentAllocations.reduce((sum: Prisma.Decimal, a: any) => sum.add(a.amount), new Prisma.Decimal(0));
    const creditApplied = invoice.creditNotes.reduce((sum: Prisma.Decimal, c: any) => sum.add(c.amount), new Prisma.Decimal(0));
    const balanceDue = invoice.netTotal.sub(allocated).sub(creditApplied);
    return { ...invoice, balanceDue };
  }

  async createInvoice(patientId: string, dto: CreateInvoiceDto, actorUserId: string) {
    await this.patientsService.getPatient(patientId, dto.entityId);
    if (dto.visitId) await this.getOwnVisit(dto.visitId, dto.entityId);
    if (dto.items.length === 0) throw new BadRequestException("An invoice needs at least one item");

    const { priced, totals } = await this.priceLineItems(dto.entityId, dto.items);

    const invoice = await this.prisma.client.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, dto.entityId);
      return tx.invoice.create({
        data: {
          invoiceNumber,
          entityId: dto.entityId,
          patientId,
          visitId: dto.visitId,
          status: "ISSUED",
          createdById: actorUserId,
          grossTotal: totals.gross,
          discountTotal: totals.discount,
          taxTotal: totals.tax,
          netTotal: totals.net,
          items: {
            create: priced.map((p) => ({
              toothNumber: p.toothNumber as number | undefined,
              plannedByDoctorId: p.plannedByDoctorId as string | undefined,
              performedByDoctorId: p.performedByDoctorId as string | undefined,
              description: p.description!,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              discountAmount: p.discountAmount,
              taxProfileId: p.taxProfileId as string | undefined,
              lineTotal: p.lineTotal,
            })),
          },
        },
        include: { items: true },
      });
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.invoice_created",
      resourceType: "invoice",
      resourceId: invoice.id,
      after: { invoiceNumber: invoice.invoiceNumber, netTotal: invoice.netTotal.toString() },
    });
    return invoice;
  }

  /**
   * Converts some or all of an ACCEPTED estimate's remaining (un-invoiced)
   * quantity into a new invoice. Never invoices the same line twice: the
   * remaining-quantity check here is a friendly pre-check, but the real
   * guarantee is the estimate_items CHECK constraints
   * (invoiced_qty_check/invoiced_amount_check), which reject the
   * increment below outright if two concurrent conversions would
   * otherwise double-book the same line.
   */
  async convertEstimateToInvoice(estimateId: string, dto: ConvertEstimateToInvoiceDto, actorUserId: string) {
    const estimate = await this.getOwnEstimate(estimateId, dto.entityId);
    if (estimate.status !== "ACCEPTED") {
      throw new BadRequestException(`Estimate must be ACCEPTED before invoicing (currently ${estimate.status})`);
    }
    if (dto.visitId) await this.getOwnVisit(dto.visitId, dto.entityId);
    if (dto.selections.length === 0) throw new BadRequestException("Select at least one estimate item to invoice");

    const itemsById = new Map(estimate.items.map((i) => [i.id, i]));
    const catalogIds = [...new Set(estimate.items.map((i) => i.treatmentCatalogId))];
    const catalogs = await this.prisma.client.treatmentCatalog.findMany({ where: { id: { in: catalogIds } } });
    const catalogNameById = new Map(catalogs.map((c) => [c.id, c.name]));

    let invoice;
    try {
      invoice = await this.prisma.client.$transaction(async (tx) => {
        let gross = new Prisma.Decimal(0);
        let discount = new Prisma.Decimal(0);
        let tax = new Prisma.Decimal(0);
        let net = new Prisma.Decimal(0);
        const invoiceItemsData: any[] = [];

        for (const sel of dto.selections) {
          const item = itemsById.get(sel.estimateItemId);
          if (!item) throw new BadRequestException(`Estimate item ${sel.estimateItemId} does not belong to this estimate`);
          const remainingQty = item.quantity - item.invoicedQuantity;
          const qty = sel.quantity ?? remainingQty;
          if (qty <= 0) throw new BadRequestException(`Nothing left to invoice for estimate item ${item.id}`);
          if (qty > remainingQty) {
            throw new BadRequestException(`Requested quantity ${qty} exceeds remaining quantity ${remainingQty} for estimate item ${item.id}`);
          }

          // Proportional split of a (possibly discounted) line — note this
          // can leave a paisa or two of rounding drift across several
          // partial conversions of the same line, same as most real-world
          // billing systems; it's never enough to violate the item's
          // invoiced <= quantity/lineTotal CHECK constraints.
          const lineGrossRaw = item.unitPrice.mul(qty);
          const lineDiscount = item.quantity > 0 ? item.discountAmount.mul(qty).div(item.quantity) : new Prisma.Decimal(0);
          const lineNetPretax = lineGrossRaw.sub(lineDiscount);
          const rate = await this.getTaxRate(item.taxProfileId);
          const lineTax = lineNetPretax.mul(rate).div(100);

          gross = gross.add(lineGrossRaw);
          discount = discount.add(lineDiscount);
          tax = tax.add(lineTax);
          net = net.add(lineNetPretax).add(lineTax);

          invoiceItemsData.push({
            estimateItemId: item.id,
            toothNumber: item.toothNumber,
            plannedByDoctorId: item.plannedDoctorId,
            description: catalogNameById.get(item.treatmentCatalogId) ?? "Treatment",
            quantity: qty,
            unitPrice: item.unitPrice,
            discountAmount: lineDiscount,
            taxProfileId: item.taxProfileId,
            lineTotal: lineNetPretax,
          });

          await tx.estimateItem.update({
            where: { id: item.id },
            data: { invoicedQuantity: { increment: qty }, invoicedAmount: { increment: lineNetPretax } },
          });
        }

        const invoiceNumber = await nextInvoiceNumber(tx, dto.entityId);
        const created = await tx.invoice.create({
          data: {
            invoiceNumber,
            entityId: dto.entityId,
            patientId: estimate.patientId,
            visitId: dto.visitId ?? estimate.visitId,
            status: "ISSUED",
            createdById: actorUserId,
            grossTotal: gross,
            discountTotal: discount,
            taxTotal: tax,
            netTotal: net,
            items: { create: invoiceItemsData },
          },
          include: { items: true },
        });

        const remaining = await tx.estimateItem.aggregate({
          where: { estimateId: estimate.id },
          _sum: { quantity: true, invoicedQuantity: true },
        });
        const fullyInvoiced = (remaining._sum.invoicedQuantity ?? 0) >= (remaining._sum.quantity ?? 0);
        if (fullyInvoiced) {
          await tx.estimate.update({ where: { id: estimate.id }, data: { status: "CONVERTED" } });
        }

        return created;
      });
    } catch (e) {
      this.rethrowAsIntegrityError(e);
    }

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.invoice_created_from_estimate",
      resourceType: "invoice",
      resourceId: invoice.id,
      after: { invoiceNumber: invoice.invoiceNumber, estimateId: estimate.id, netTotal: invoice.netTotal.toString() },
    });
    return invoice;
  }

  private async assertNoActiveAllocations(invoiceId: string, message: string) {
    const active = await this.prisma.client.paymentAllocation.aggregate({ where: { invoiceId, reversedAt: null }, _sum: { amount: true } });
    if ((active._sum.amount ?? new Prisma.Decimal(0)).greaterThan(0)) {
      throw new BadRequestException(message);
    }
  }

  async voidInvoice(invoiceId: string, dto: VoidInvoiceDto, actorUserId: string) {
    const invoice = await this.getOwnInvoice(invoiceId, dto.entityId);
    if (invoice.status === "VOID") throw new BadRequestException("Invoice is already void");
    await this.assertNoActiveAllocations(invoiceId, "Reverse all payment allocations (or issue a credit note) before voiding this invoice");

    const updated = await this.prisma.client.invoice.update({
      where: { id: invoiceId },
      data: { status: "VOID", voidedAt: new Date(), voidReason: dto.reason },
    });
    await this.audit.record({ actorUserId, entityId: dto.entityId, action: "billing.invoice_voided", resourceType: "invoice", resourceId: invoiceId, after: { reason: dto.reason } });
    return updated;
  }

  /** Voids `invoiceId` and, atomically, creates its replacement — linked both ways via correctedByInvoiceId. */
  async correctInvoice(invoiceId: string, dto: CorrectInvoiceDto, actorUserId: string) {
    const original = await this.getOwnInvoice(invoiceId, dto.entityId);
    if (original.status === "VOID") throw new BadRequestException("Invoice is already void");
    if (original.correctedByInvoiceId) throw new BadRequestException("Invoice already has a corrective invoice");
    await this.assertNoActiveAllocations(invoiceId, "Reverse all payment allocations before correcting this invoice");
    if (dto.items.length === 0) throw new BadRequestException("A corrective invoice needs at least one item");

    const { priced, totals } = await this.priceLineItems(dto.entityId, dto.items);

    const corrective = await this.prisma.client.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, dto.entityId);
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          entityId: dto.entityId,
          patientId: original.patientId,
          visitId: dto.visitId ?? original.visitId,
          status: "ISSUED",
          createdById: actorUserId,
          grossTotal: totals.gross,
          discountTotal: totals.discount,
          taxTotal: totals.tax,
          netTotal: totals.net,
          items: {
            create: priced.map((p) => ({
              toothNumber: p.toothNumber as number | undefined,
              plannedByDoctorId: p.plannedByDoctorId as string | undefined,
              performedByDoctorId: p.performedByDoctorId as string | undefined,
              description: p.description!,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              discountAmount: p.discountAmount,
              taxProfileId: p.taxProfileId as string | undefined,
              lineTotal: p.lineTotal,
            })),
          },
        },
      });
      await tx.invoice.update({
        where: { id: original.id },
        data: { status: "VOID", voidedAt: new Date(), voidReason: dto.reason, correctedByInvoiceId: created.id },
      });
      return created;
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.invoice_corrected",
      resourceType: "invoice",
      resourceId: corrective.id,
      after: { correctsInvoiceId: original.id, reason: dto.reason },
    });
    return corrective;
  }

  // --- Payments & receipts -------------------------------------------------------

  async listPayments(patientId: string, entityId: string) {
    await this.patientsService.getPatient(patientId, entityId);
    return this.prisma.client.payment.findMany({
      where: { patientId, entityId },
      include: { receipt: true, allocations: { include: { invoice: { select: { id: true, invoiceNumber: true } } } } },
      orderBy: { paymentDate: "desc" },
    });
  }

  private async getOwnPayment(paymentId: string, entityId: string) {
    const payment = await this.prisma.client.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.entityId !== entityId) throw new NotFoundException("Payment not found for this entity");
    return payment;
  }

  /** Idempotent: a retried submit with the same idempotencyKey returns the original payment/receipt rather than creating a duplicate. */
  async recordPayment(patientId: string, dto: CreatePaymentDto, actorUserId: string) {
    await this.patientsService.getPatient(patientId, dto.entityId);

    if (dto.idempotencyKey) {
      const existing = await this.prisma.client.payment.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { receipt: true } });
      if (existing) return existing;
    }

    let payment;
    try {
      payment = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            entityId: dto.entityId,
            patientId,
            amount: new Prisma.Decimal(dto.amount),
            mode: dto.mode as any,
            transactionReference: dto.transactionReference,
            remarks: dto.remarks,
            idempotencyKey: dto.idempotencyKey,
            receivedById: actorUserId,
          },
        });
        const receiptNumber = await nextReceiptNumber(tx, dto.entityId);
        const receipt = await tx.receipt.create({
          data: { receiptNumber, paymentId: created.id, entityId: dto.entityId, cashierId: actorUserId },
        });
        return { ...created, receipt };
      });
    } catch (e) {
      if (dto.idempotencyKey && this.isUniqueViolation(e)) {
        const existing = await this.prisma.client.payment.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { receipt: true } });
        if (existing) return existing;
      }
      throw e;
    }

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.payment_recorded",
      resourceType: "payment",
      resourceId: payment.id,
      after: { amount: payment.amount.toString(), mode: dto.mode },
    });
    return payment;
  }

  async getReceiptForPayment(paymentId: string, entityId: string) {
    const payment = await this.prisma.client.payment.findUnique({
      where: { id: paymentId },
      include: { receipt: true, patient: { select: { id: true, fullName: true, uhid: true } } },
    });
    if (!payment || payment.entityId !== entityId) throw new NotFoundException("Payment not found for this entity");
    if (!payment.receipt) throw new NotFoundException("No receipt for this payment");
    return { ...payment.receipt, payment };
  }

  // --- Payment allocation -------------------------------------------------------

  /**
   * Friendly pre-checks here give a clear 400 in the common case; the
   * trg_payment_allocation_insupd DB trigger (packages/database migration
   * 20261122170000_stage5_billing) is the actual source of truth and is
   * what makes this safe under concurrent requests — see
   * BillingService.rethrowAsIntegrityError.
   */
  async createAllocation(paymentId: string, dto: CreateAllocationDto, actorUserId: string) {
    const payment = await this.getOwnPayment(paymentId, dto.entityId);
    const invoice = await this.getOwnInvoice(dto.invoiceId, dto.entityId);

    const [paymentAllocated, invoiceAllocated, creditNotesIssued] = await Promise.all([
      this.prisma.client.paymentAllocation.aggregate({ where: { paymentId, reversedAt: null }, _sum: { amount: true } }),
      this.prisma.client.paymentAllocation.aggregate({ where: { invoiceId: dto.invoiceId, reversedAt: null }, _sum: { amount: true } }),
      this.prisma.client.creditNote.aggregate({ where: { invoiceId: dto.invoiceId, status: "ISSUED" }, _sum: { amount: true } }),
    ]);
    const paymentRemaining = payment.amount.sub(paymentAllocated._sum.amount ?? 0);
    const invoiceBalance = invoice.netTotal.sub(invoiceAllocated._sum.amount ?? 0).sub(creditNotesIssued._sum.amount ?? 0);
    const amount = new Prisma.Decimal(dto.amount);

    if (amount.greaterThan(paymentRemaining)) {
      throw new BadRequestException(`Allocation amount ${amount} exceeds this payment's remaining amount ${paymentRemaining}`);
    }
    if (amount.greaterThan(invoiceBalance)) {
      throw new BadRequestException(`Allocation amount ${amount} exceeds this invoice's outstanding balance ${invoiceBalance}`);
    }

    let allocation;
    try {
      allocation = await this.prisma.client.paymentAllocation.create({
        data: { paymentId, invoiceId: dto.invoiceId, amount, allocatedById: actorUserId },
      });
    } catch (e) {
      this.rethrowAsIntegrityError(e);
    }

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.payment_allocated",
      resourceType: "payment_allocation",
      resourceId: allocation.id,
      after: { paymentId, invoiceId: dto.invoiceId, amount: amount.toString() },
    });
    return allocation;
  }

  async reverseAllocation(allocationId: string, dto: ReverseAllocationDto, actorUserId: string) {
    const allocation = await this.prisma.client.paymentAllocation.findUnique({ where: { id: allocationId }, include: { invoice: true } });
    if (!allocation || allocation.invoice.entityId !== dto.entityId) throw new NotFoundException("Allocation not found for this entity");
    if (allocation.reversedAt) throw new BadRequestException("Allocation already reversed");

    const updated = await this.prisma.client.paymentAllocation.update({
      where: { id: allocationId },
      data: { reversedAt: new Date(), reversalReason: dto.reason },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.payment_allocation_reversed",
      resourceType: "payment_allocation",
      resourceId: allocationId,
      after: { reason: dto.reason },
    });
    return updated;
  }

  // --- Credit notes -----------------------------------------------------------

  async listCreditNotes(patientId: string, entityId: string) {
    await this.patientsService.getPatient(patientId, entityId);
    return this.prisma.client.creditNote.findMany({ where: { patientId, entityId }, orderBy: { issuedAt: "desc" } });
  }

  async createCreditNote(patientId: string, dto: CreateCreditNoteDto, actorUserId: string) {
    await this.patientsService.getPatient(patientId, dto.entityId);
    if (dto.invoiceId) {
      const invoice = await this.getOwnInvoice(dto.invoiceId, dto.entityId);
      if (invoice.patientId !== patientId) throw new BadRequestException("invoiceId does not belong to this patient");
    }
    const creditNote = await this.prisma.client.creditNote.create({
      data: { entityId: dto.entityId, patientId, invoiceId: dto.invoiceId, amount: new Prisma.Decimal(dto.amount), reason: dto.reason, issuedById: actorUserId },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "billing.credit_note_issued",
      resourceType: "credit_note",
      resourceId: creditNote.id,
      after: { amount: dto.amount, invoiceId: dto.invoiceId },
    });
    return creditNote;
  }

  async voidCreditNote(creditNoteId: string, dto: VoidCreditNoteDto, actorUserId: string) {
    const note = await this.prisma.client.creditNote.findUnique({ where: { id: creditNoteId } });
    if (!note || note.entityId !== dto.entityId) throw new NotFoundException("Credit note not found for this entity");
    if (note.status === "VOID") throw new BadRequestException("Credit note already void");
    const updated = await this.prisma.client.creditNote.update({ where: { id: creditNoteId }, data: { status: "VOID" } });
    await this.audit.record({ actorUserId, entityId: dto.entityId, action: "billing.credit_note_voided", resourceType: "credit_note", resourceId: creditNoteId });
    return updated;
  }

  // --- Refunds --------------------------------------------------------------

  async listRefunds(patientId: string, entityId: string) {
    await this.patientsService.getPatient(patientId, entityId);
    return this.prisma.client.refund.findMany({ where: { patientId, entityId }, orderBy: { requestedAt: "desc" } });
  }

  async requestRefund(patientId: string, dto: CreateRefundDto, actorUserId: string) {
    await this.patientsService.getPatient(patientId, dto.entityId);
    if (dto.paymentId) {
      const payment = await this.getOwnPayment(dto.paymentId, dto.entityId);
      if (payment.patientId !== patientId) throw new BadRequestException("paymentId does not belong to this patient");
    }
    const refund = await this.prisma.client.refund.create({
      data: {
        entityId: dto.entityId,
        patientId,
        paymentId: dto.paymentId,
        amount: new Prisma.Decimal(dto.amount),
        reason: dto.reason,
        mode: dto.mode as any,
        requestedById: actorUserId,
      },
    });
    await this.audit.record({ actorUserId, entityId: dto.entityId, action: "billing.refund_requested", resourceType: "refund", resourceId: refund.id, after: { amount: dto.amount } });
    return refund;
  }

  private async getOwnRefund(refundId: string, entityId: string) {
    const refund = await this.prisma.client.refund.findUnique({ where: { id: refundId } });
    if (!refund || refund.entityId !== entityId) throw new NotFoundException("Refund not found for this entity");
    return refund;
  }

  async approveRefund(refundId: string, dto: RefundActionDto, actorUserId: string) {
    const refund = await this.getOwnRefund(refundId, dto.entityId);
    if (refund.status !== "REQUESTED") throw new BadRequestException(`Cannot approve a refund in ${refund.status} status`);
    const updated = await this.prisma.client.refund.update({ where: { id: refundId }, data: { status: "APPROVED", approvedById: actorUserId } });
    await this.audit.record({ actorUserId, entityId: dto.entityId, action: "billing.refund_approved", resourceType: "refund", resourceId: refundId });
    return updated;
  }

  async completeRefund(refundId: string, dto: RefundActionDto, actorUserId: string) {
    const refund = await this.getOwnRefund(refundId, dto.entityId);
    if (refund.status !== "APPROVED") throw new BadRequestException(`Cannot complete a refund in ${refund.status} status`);
    let updated;
    try {
      updated = await this.prisma.client.refund.update({ where: { id: refundId }, data: { status: "COMPLETED", refundedAt: new Date() } });
    } catch (e) {
      this.rethrowAsIntegrityError(e);
    }
    await this.audit.record({ actorUserId, entityId: dto.entityId, action: "billing.refund_completed", resourceType: "refund", resourceId: refundId });
    return updated;
  }

  async rejectRefund(refundId: string, dto: RefundActionDto, actorUserId: string) {
    const refund = await this.getOwnRefund(refundId, dto.entityId);
    if (refund.status !== "REQUESTED") throw new BadRequestException(`Cannot reject a refund in ${refund.status} status`);
    const updated = await this.prisma.client.refund.update({ where: { id: refundId }, data: { status: "REJECTED" } });
    await this.audit.record({ actorUserId, entityId: dto.entityId, action: "billing.refund_rejected", resourceType: "refund", resourceId: refundId });
    return updated;
  }
}
