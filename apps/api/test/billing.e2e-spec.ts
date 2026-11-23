import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@rhcm/database";
import { createTestApp, extractCookie, loginWithMfa } from "./test-app";

const DEV_PASSWORD = "DevPass!2026";

describe("Billing: estimates, invoices, receipts, payment allocation (Stage 5)", () => {
  let app: INestApplication;
  let server: any;
  let clinicId: string;
  let trustId: string;
  let catalogItemId: string;
  let patientId: string;
  let superAdminCookie: string;
  let billingCookie: string;
  let accountantCookie: string;
  let receptionistCookie: string;
  let nurseCookie: string;

  async function loginSimple(email: string): Promise<string> {
    const res = await request(server).post("/auth/login").send({ email, password: DEV_PASSWORD }).expect(200);
    return extractCookie(res);
  }

  async function loginMfa(email: string): Promise<string> {
    return loginWithMfa(server, email, DEV_PASSWORD);
  }

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();

    const clinic = await prisma.entity.findUniqueOrThrow({ where: { code: "CLINIC" } });
    const trust = await prisma.entity.findUniqueOrThrow({ where: { code: "TRUST" } });
    clinicId = clinic.id;
    trustId = trust.id;

    const catalogItem = await prisma.treatmentCatalog.findFirstOrThrow({ where: { code: "SCALE-POL" } });
    catalogItemId = catalogItem.id;

    const patient = await prisma.patient.findFirstOrThrow({ where: { phone: "+91-9000000001" } });
    patientId = patient.id;

    receptionistCookie = await loginSimple("receptionist@rhcm.test");
    nurseCookie = await loginSimple("nurse@rhcm.test");
    billingCookie = await loginSimple("billing@rhcm.test");
    accountantCookie = await loginMfa("accountant@rhcm.test");
    superAdminCookie = await loginMfa("superadmin@rhcm.test");
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createAcceptedEstimate(quantity: number, unitPrice: number, discountAmount = 0, taxProfileId?: string) {
    const createRes = await request(server)
      .post(`/patients/${patientId}/estimates`)
      .set("Cookie", billingCookie)
      .send({
        entityId: clinicId,
        items: [{ treatmentCatalogId: catalogItemId, quantity, unitPrice, discountAmount, taxProfileId }],
      })
      .expect(201);
    const id = createRes.body.id;
    await request(server).patch(`/estimates/${id}/status`).set("Cookie", billingCookie).send({ entityId: clinicId, status: "SENT" }).expect(200);
    const accepted = await request(server)
      .patch(`/estimates/${id}/status`)
      .set("Cookie", billingCookie)
      .send({ entityId: clinicId, status: "ACCEPTED" })
      .expect(200);
    return { id, itemId: createRes.body.items[0].id, estimate: accepted.body };
  }

  describe("estimates", () => {
    it("computes gross/discount/tax/net totals exactly, with tax applied after discount", async () => {
      const taxProfile = await request(server)
        .post("/tax-profiles")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, name: `Test GST ${Date.now()}`, rate: 10 })
        .expect(201);

      const res = await request(server)
        .post(`/patients/${patientId}/estimates`)
        .set("Cookie", billingCookie)
        .send({
          entityId: clinicId,
          items: [{ treatmentCatalogId: catalogItemId, quantity: 2, unitPrice: 500, discountAmount: 100, taxProfileId: taxProfile.body.id }],
        })
        .expect(201);

      // gross = 2*500 = 1000; discount = 100; pre-tax lineTotal = 900; tax = 10% of 900 = 90; net = 990.
      expect(res.body.grossTotal).toBe("1000");
      expect(res.body.discountTotal).toBe("100");
      expect(res.body.taxTotal).toBe("90");
      expect(res.body.netTotal).toBe("990");
    });

    it("follows the DRAFT -> SENT -> ACCEPTED/REJECTED workflow and rejects invalid jumps", async () => {
      const createRes = await request(server)
        .post(`/patients/${patientId}/estimates`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ treatmentCatalogId: catalogItemId, quantity: 1, unitPrice: 1200 }] })
        .expect(201);
      const id = createRes.body.id;
      expect(createRes.body.status).toBe("DRAFT");

      await request(server)
        .patch(`/estimates/${id}/status`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, status: "ACCEPTED" })
        .expect(400); // cannot jump DRAFT -> ACCEPTED directly

      await request(server).patch(`/estimates/${id}/status`).set("Cookie", billingCookie).send({ entityId: clinicId, status: "SENT" }).expect(200);
      await request(server)
        .patch(`/estimates/${id}/status`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, status: "REJECTED" })
        .expect(200);
    });

    it("denies creating an estimate without estimate.create", async () => {
      await request(server)
        .post(`/patients/${patientId}/estimates`)
        .set("Cookie", nurseCookie)
        .send({ entityId: clinicId, items: [{ treatmentCatalogId: catalogItemId, quantity: 1, unitPrice: 100 }] })
        .expect(403);
    });

    it("revising an estimate supersedes the original and bumps the version", async () => {
      const { id } = await createAcceptedEstimate(1, 1000);
      const revised = await request(server)
        .post(`/estimates/${id}/revise`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ treatmentCatalogId: catalogItemId, quantity: 1, unitPrice: 1100 }] })
        .expect(201);
      expect(revised.body.version).toBe(2);
      expect(revised.body.supersedesEstimateId).toBe(id);

      const original = await request(server).get(`/estimates/${id}?entityId=${clinicId}`).set("Cookie", billingCookie).expect(200);
      expect(original.body.status).toBe("SUPERSEDED");
    });
  });

  describe("estimate -> invoice conversion (never invoice the same line twice)", () => {
    it("allows partial conversion, tracks invoicedQuantity, and converts the estimate once fully consumed", async () => {
      const { id, itemId } = await createAcceptedEstimate(2, 500);

      const firstInvoice = await request(server)
        .post(`/estimates/${id}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, selections: [{ estimateItemId: itemId, quantity: 1 }] })
        .expect(201);
      expect(firstInvoice.body.netTotal).toBe("500");

      const midEstimate = await request(server).get(`/estimates/${id}?entityId=${clinicId}`).set("Cookie", billingCookie).expect(200);
      expect(midEstimate.body.status).toBe("ACCEPTED"); // not fully converted yet
      expect(midEstimate.body.items[0].invoicedQuantity).toBe(1);

      // Over-invoicing the remaining quantity is rejected.
      await request(server)
        .post(`/estimates/${id}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, selections: [{ estimateItemId: itemId, quantity: 2 }] })
        .expect(400);

      const secondInvoice = await request(server)
        .post(`/estimates/${id}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, selections: [{ estimateItemId: itemId }] }) // defaults to remaining (1)
        .expect(201);
      expect(secondInvoice.body.netTotal).toBe("500");

      const finalEstimate = await request(server).get(`/estimates/${id}?entityId=${clinicId}`).set("Cookie", billingCookie).expect(200);
      expect(finalEstimate.body.status).toBe("CONVERTED");

      // A third attempt against the now-fully-invoiced item is rejected even on a fresh request.
      await request(server)
        .post(`/estimates/${id}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, selections: [{ estimateItemId: itemId, quantity: 1 }] })
        .expect(400);
    });

    it("rejects conversion of an estimate that is not ACCEPTED", async () => {
      const createRes = await request(server)
        .post(`/patients/${patientId}/estimates`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ treatmentCatalogId: catalogItemId, quantity: 1, unitPrice: 100 }] })
        .expect(201);
      await request(server)
        .post(`/estimates/${createRes.body.id}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, selections: [{ estimateItemId: createRes.body.items[0].id }] })
        .expect(400);
    });

    it("never double-invoices the same line under 5 concurrent conversion requests", async () => {
      const { id, itemId } = await createAcceptedEstimate(1, 1000);

      const attempts = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          request(server)
            .post(`/estimates/${id}/invoices`)
            .set("Cookie", billingCookie)
            .send({ entityId: clinicId, selections: [{ estimateItemId: itemId, quantity: 1 }] }),
        ),
      );
      const succeeded = attempts.filter((a) => a.status === "fulfilled" && (a.value as any).status === 201);
      expect(succeeded).toHaveLength(1);

      const item = await prisma.estimateItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item.invoicedQuantity).toBe(1);
    });
  });

  describe("invoices: immutability, void, and correction", () => {
    it("creates a direct ad hoc invoice and denies invoice.create without permission", async () => {
      await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", receptionistCookie)
        .send({ entityId: clinicId, items: [{ description: "Consultation", quantity: 1, unitPrice: 300 }] })
        .expect(403);

      const res = await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "Consultation", quantity: 1, unitPrice: 300 }] })
        .expect(201);
      expect(res.body.status).toBe("ISSUED");
      expect(res.body.netTotal).toBe("300");
    });

    it("voids an invoice with no active allocations, and denies voiding without invoice.void", async () => {
      const invoiceRes = await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "X-Ray", quantity: 1, unitPrice: 250 }] })
        .expect(201);

      await request(server)
        .post(`/invoices/${invoiceRes.body.id}/void`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, reason: "test" })
        .expect(403); // billing executive has no invoice.void

      await request(server)
        .post(`/invoices/${invoiceRes.body.id}/void`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, reason: "Wrong patient" })
        .expect(201);

      const voided = await request(server).get(`/invoices/${invoiceRes.body.id}?entityId=${clinicId}`).set("Cookie", accountantCookie).expect(200);
      expect(voided.body.status).toBe("VOID");
      expect(voided.body.voidReason).toBe("Wrong patient");
    });

    it("refuses to void an invoice with an active (unreversed) payment allocation", async () => {
      const invoiceRes = await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "Filling", quantity: 1, unitPrice: 1000 }] })
        .expect(201);
      const paymentRes = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 1000, mode: "CASH" })
        .expect(201);
      await request(server)
        .post(`/payments/${paymentRes.body.id}/allocations`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, invoiceId: invoiceRes.body.id, amount: 1000 })
        .expect(201);

      await request(server)
        .post(`/invoices/${invoiceRes.body.id}/void`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, reason: "test" })
        .expect(400);
    });

    it("corrects an invoice: voids the original and links it to a fresh replacement", async () => {
      const invoiceRes = await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "Wrong amount", quantity: 1, unitPrice: 999 }] })
        .expect(201);

      const corrected = await request(server)
        .post(`/invoices/${invoiceRes.body.id}/correct`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, reason: "Typo in amount", items: [{ description: "Correct amount", quantity: 1, unitPrice: 900 }] })
        .expect(201);
      expect(corrected.body.netTotal).toBe("900");

      const original = await request(server).get(`/invoices/${invoiceRes.body.id}?entityId=${clinicId}`).set("Cookie", accountantCookie).expect(200);
      expect(original.body.status).toBe("VOID");
      expect(original.body.correctedByInvoiceId).toBe(corrected.body.id);
    });
  });

  describe("payments & receipts", () => {
    it("is idempotent: a retried submit with the same idempotencyKey returns the original payment, not a duplicate", async () => {
      const key = `test-idem-${Date.now()}`;
      const first = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 250, mode: "CASH", idempotencyKey: key })
        .expect(201);
      const second = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 250, mode: "CASH", idempotencyKey: key })
        .expect(201);
      expect(second.body.id).toBe(first.body.id);

      const count = await prisma.payment.count({ where: { idempotencyKey: key } });
      expect(count).toBe(1);
    });

    it("mints exactly one receipt per payment, and denies recording a payment without payment.receive", async () => {
      await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", receptionistCookie)
        .send({ entityId: clinicId, amount: 100, mode: "CASH" })
        .expect(403);

      const paymentRes = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 150, mode: "UPI", transactionReference: "UPI-TEST-1" })
        .expect(201);
      expect(paymentRes.body.receipt.receiptNumber).toMatch(/^RCT-/);

      const receiptRes = await request(server)
        .get(`/payments/${paymentRes.body.id}/receipt?entityId=${clinicId}`)
        .set("Cookie", accountantCookie)
        .expect(200);
      expect(receiptRes.body.receiptNumber).toBe(paymentRes.body.receipt.receiptNumber);
    });
  });

  describe("payment allocation: the critical balance-integrity module", () => {
    it("never allocates beyond the invoice's balance or the payment's remaining amount", async () => {
      const invoiceRes = await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "Procedure", quantity: 1, unitPrice: 1000 }] })
        .expect(201);
      const paymentRes = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 1000, mode: "CASH" })
        .expect(201);

      await request(server)
        .post(`/payments/${paymentRes.body.id}/allocations`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, invoiceId: invoiceRes.body.id, amount: 1500 })
        .expect(400); // exceeds both invoice balance and payment amount

      const alloc = await request(server)
        .post(`/payments/${paymentRes.body.id}/allocations`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, invoiceId: invoiceRes.body.id, amount: 600 })
        .expect(201);

      const midInvoice = await request(server).get(`/invoices/${invoiceRes.body.id}?entityId=${clinicId}`).set("Cookie", accountantCookie).expect(200);
      expect(midInvoice.body.status).toBe("PARTIALLY_PAID");
      expect(midInvoice.body.paidAmount).toBe("600");

      // The remaining balance is only 400 — allocating another 600 (within the
      // payment's own remaining 400) must be rejected by the invoice-side cap.
      await request(server)
        .post(`/payments/${paymentRes.body.id}/allocations`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, invoiceId: invoiceRes.body.id, amount: 401 })
        .expect(400);

      await request(server)
        .post(`/payments/${paymentRes.body.id}/allocations`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, invoiceId: invoiceRes.body.id, amount: 400 })
        .expect(201);

      const paidInvoice = await request(server).get(`/invoices/${invoiceRes.body.id}?entityId=${clinicId}`).set("Cookie", accountantCookie).expect(200);
      expect(paidInvoice.body.status).toBe("PAID");
      expect(paidInvoice.body.paidAmount).toBe("1000");

      // Reversing an allocation brings the invoice back down.
      await request(server)
        .post(`/payment-allocations/${alloc.body.id}/reverse`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, reason: "test reversal" })
        .expect(201);

      const reversedInvoice = await request(server).get(`/invoices/${invoiceRes.body.id}?entityId=${clinicId}`).set("Cookie", accountantCookie).expect(200);
      expect(reversedInvoice.body.status).toBe("PARTIALLY_PAID");
      expect(reversedInvoice.body.paidAmount).toBe("400");
    });

    it("never crosses entities: a Trust payment cannot be allocated to a Clinic invoice", async () => {
      const invoiceRes = await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "Cross-entity test", quantity: 1, unitPrice: 500 }] })
        .expect(201);

      // Use a Trust-linked patient (Arun Das, linked to both entities).
      const arun = await prisma.patient.findFirstOrThrow({ where: { fullName: "Arun Das" } });
      const trustPaymentRes = await request(server)
        .post(`/patients/${arun.id}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: trustId, amount: 500, mode: "CASH" })
        .expect(201);

      await request(server)
        .post(`/payments/${trustPaymentRes.body.id}/allocations`)
        .set("Cookie", accountantCookie)
        .send({ entityId: trustId, invoiceId: invoiceRes.body.id, amount: 500 })
        .expect(404); // entity-scoped invoice lookup 404s before the trigger is even reached
    });

    it("never over-allocates under 5 concurrent allocation requests for the same invoice", async () => {
      const invoiceRes = await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "Concurrency test", quantity: 1, unitPrice: 1000 }] })
        .expect(201);
      const paymentRes = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 1000, mode: "CASH" })
        .expect(201);

      const attempts = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          request(server)
            .post(`/payments/${paymentRes.body.id}/allocations`)
            .set("Cookie", accountantCookie)
            .send({ entityId: clinicId, invoiceId: invoiceRes.body.id, amount: 1000 }),
        ),
      );
      const succeeded = attempts.filter((a) => a.status === "fulfilled" && (a.value as any).status === 201);
      expect(succeeded).toHaveLength(1);

      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceRes.body.id } });
      expect(invoice.paidAmount.toString()).toBe("1000");
    });
  });

  describe("credit notes", () => {
    it("issues and voids a credit note, and denies issuing one without invoice.void", async () => {
      await request(server)
        .post(`/patients/${patientId}/credit-notes`)
        .set("Cookie", receptionistCookie)
        .send({ entityId: clinicId, amount: 50, reason: "test" })
        .expect(403);

      const noteRes = await request(server)
        .post(`/patients/${patientId}/credit-notes`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 50, reason: "Goodwill" })
        .expect(201);
      expect(noteRes.body.status).toBe("ISSUED");

      await request(server).post(`/credit-notes/${noteRes.body.id}/void`).set("Cookie", accountantCookie).send({ entityId: clinicId }).expect(201);
      const list = await request(server).get(`/patients/${patientId}/credit-notes?entityId=${clinicId}`).set("Cookie", accountantCookie).expect(200);
      expect(list.body.find((n: any) => n.id === noteRes.body.id).status).toBe("VOID");
    });
  });

  describe("refunds: request -> approve -> complete", () => {
    it("walks the full lifecycle and enforces the approval gate", async () => {
      const paymentRes = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 300, mode: "CASH" })
        .expect(201);

      const refundRes = await request(server)
        .post(`/patients/${patientId}/refunds`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, paymentId: paymentRes.body.id, amount: 100, reason: "Overpaid", mode: "CASH" })
        .expect(201);
      expect(refundRes.body.status).toBe("REQUESTED");

      // Cannot complete before approval.
      await request(server).patch(`/refunds/${refundRes.body.id}/complete`).set("Cookie", accountantCookie).send({ entityId: clinicId }).expect(400);

      await request(server).patch(`/refunds/${refundRes.body.id}/approve`).set("Cookie", accountantCookie).send({ entityId: clinicId }).expect(200);
      const completed = await request(server)
        .patch(`/refunds/${refundRes.body.id}/complete`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId })
        .expect(200);
      expect(completed.body.status).toBe("COMPLETED");
      expect(completed.body.refundedAt).not.toBeNull();
    });

    it("never refunds more than the payment's own amount, even across multiple approved refunds", async () => {
      const paymentRes = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 200, mode: "CASH" })
        .expect(201);

      const refund1 = await request(server)
        .post(`/patients/${patientId}/refunds`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, paymentId: paymentRes.body.id, amount: 150, reason: "r1", mode: "CASH" })
        .expect(201);
      const refund2 = await request(server)
        .post(`/patients/${patientId}/refunds`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, paymentId: paymentRes.body.id, amount: 100, reason: "r2", mode: "CASH" })
        .expect(201);

      await request(server).patch(`/refunds/${refund1.body.id}/approve`).set("Cookie", accountantCookie).send({ entityId: clinicId }).expect(200);
      await request(server).patch(`/refunds/${refund2.body.id}/approve`).set("Cookie", accountantCookie).send({ entityId: clinicId }).expect(200);

      await request(server).patch(`/refunds/${refund1.body.id}/complete`).set("Cookie", accountantCookie).send({ entityId: clinicId }).expect(200);
      // 150 + 100 = 250 > 200 payment amount — the second completion must be rejected.
      await request(server).patch(`/refunds/${refund2.body.id}/complete`).set("Cookie", accountantCookie).send({ entityId: clinicId }).expect(400);
    });

    it("denies requesting a refund without payment.allocate and approving one without refund.approve", async () => {
      const paymentRes = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 80, mode: "CASH" })
        .expect(201);

      await request(server)
        .post(`/patients/${patientId}/refunds`)
        .set("Cookie", receptionistCookie)
        .send({ entityId: clinicId, paymentId: paymentRes.body.id, amount: 20, reason: "test", mode: "CASH" })
        .expect(403);

      const refundRes = await request(server)
        .post(`/patients/${patientId}/refunds`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, paymentId: paymentRes.body.id, amount: 20, reason: "test", mode: "CASH" })
        .expect(201);

      await request(server).patch(`/refunds/${refundRes.body.id}/approve`).set("Cookie", billingCookie).send({ entityId: clinicId }).expect(403);
    });
  });

  describe("entity isolation", () => {
    it("404s fetching another entity's estimate, invoice, or payment receipt", async () => {
      const { id: estimateId } = await createAcceptedEstimate(1, 100);
      await request(server).get(`/estimates/${estimateId}?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(404);

      const invoiceRes = await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "Isolation test", quantity: 1, unitPrice: 100 }] })
        .expect(201);
      await request(server).get(`/invoices/${invoiceRes.body.id}?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(404);

      const paymentRes = await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 100, mode: "CASH" })
        .expect(201);
      await request(server).get(`/payments/${paymentRes.body.id}/receipt?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(404);
    });
  });
});
