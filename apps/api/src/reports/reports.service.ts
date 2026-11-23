import { Injectable } from "@nestjs/common";
import { Prisma } from "@rhcm/database";
import { PrismaService } from "../prisma/prisma.service";
import { addMinutes, istDateOnly, istToUtc } from "../common/time/ist";

interface DateRange {
  from?: string;
  to?: string;
}

function dayKey(date: Date): string {
  return istDateOnly(date).toISOString().slice(0, 10);
}

function rangeWhere(field: string, { from, to }: DateRange): Record<string, Date> | undefined {
  const where: Record<string, Date> = {};
  if (from) where.gte = istToUtc(from, "00:00");
  if (to) where.lt = addMinutes(istToUtc(to, "00:00"), 24 * 60); // exclusive upper bound, so `to` itself is fully included
  return Object.keys(where).length > 0 ? { [field]: where } as any : undefined;
}

/**
 * Every method here takes a single entityId — the entity-scoping is the
 * caller's job (ReportsController), never an unscoped query, per
 * docs/ARCHITECTURE.md Section 6.6: a cross-entity report explicitly
 * loops over every entity the caller has report.read on and unions the
 * per-entity results, rather than this service ever running one query
 * across all entities at once.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async collections(entityId: string, range: DateRange) {
    const payments = await this.prisma.client.payment.findMany({
      where: { entityId, ...rangeWhere("paymentDate", range) },
      select: { paymentDate: true, amount: true, mode: true },
    });

    const byDay = new Map<string, Prisma.Decimal>();
    const byMode = new Map<string, Prisma.Decimal>();
    let total = new Prisma.Decimal(0);
    for (const p of payments) {
      const day = dayKey(p.paymentDate);
      byDay.set(day, (byDay.get(day) ?? new Prisma.Decimal(0)).add(p.amount));
      byMode.set(p.mode, (byMode.get(p.mode) ?? new Prisma.Decimal(0)).add(p.amount));
      total = total.add(p.amount);
    }

    return {
      total: total.toString(),
      paymentCount: payments.length,
      byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount: amount.toString() })),
      byMode: [...byMode.entries()].map(([mode, amount]) => ({ mode, amount: amount.toString() })),
    };
  }

  async outstandingBalances(entityId: string) {
    const invoices = await this.prisma.client.invoice.findMany({
      where: { entityId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      include: {
        patient: { select: { id: true, fullName: true, uhid: true } },
        creditNotes: { where: { status: "ISSUED" } },
      },
      orderBy: { invoiceDate: "asc" },
    });

    const rows = invoices
      .map((inv) => {
        const creditApplied = inv.creditNotes.reduce((sum, c) => sum.add(c.amount), new Prisma.Decimal(0));
        const balance = inv.netTotal.sub(inv.paidAmount).sub(creditApplied);
        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          patient: inv.patient,
          netTotal: inv.netTotal.toString(),
          paidAmount: inv.paidAmount.toString(),
          balance: balance.toString(),
          status: inv.status,
        };
      })
      .filter((r) => Number(r.balance) > 0);

    const totalOutstanding = rows.reduce((sum, r) => sum.add(new Prisma.Decimal(r.balance)), new Prisma.Decimal(0));
    return { totalOutstanding: totalOutstanding.toString(), invoices: rows };
  }

  async doctorProduction(entityId: string, range: DateRange) {
    const invoices = await this.prisma.client.invoice.findMany({
      where: { entityId, status: { not: "VOID" }, ...rangeWhere("invoiceDate", range) },
      include: { items: { include: { performedByDoctor: { select: { id: true, fullName: true } } } } },
    });

    const byDoctor = new Map<string, { doctorId: string | null; doctorName: string; amount: Prisma.Decimal; lineCount: number }>();
    for (const inv of invoices) {
      for (const item of inv.items) {
        const key = item.performedByDoctorId ?? "unassigned";
        const entry = byDoctor.get(key) ?? {
          doctorId: item.performedByDoctorId,
          doctorName: item.performedByDoctor?.fullName ?? "Unassigned",
          amount: new Prisma.Decimal(0),
          lineCount: 0,
        };
        entry.amount = entry.amount.add(item.lineTotal);
        entry.lineCount += 1;
        byDoctor.set(key, entry);
      }
    }

    return {
      rows: [...byDoctor.values()]
        .map((e) => ({ doctorId: e.doctorId, doctorName: e.doctorName, amount: e.amount.toString(), lineCount: e.lineCount }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
    };
  }

  async visitFootfall(entityId: string, range: DateRange) {
    const visits = await this.prisma.client.visit.findMany({
      where: { entityId, ...rangeWhere("checkedInAt", range) },
      select: { checkedInAt: true, status: true },
    });

    const byDay = new Map<string, { date: string; total: number; completed: number; cancelled: number }>();
    for (const v of visits) {
      const day = dayKey(v.checkedInAt);
      const entry = byDay.get(day) ?? { date: day, total: 0, completed: 0, cancelled: 0 };
      entry.total += 1;
      if (v.status === "COMPLETED") entry.completed += 1;
      if (v.status === "CANCELLED") entry.cancelled += 1;
      byDay.set(day, entry);
    }

    return { totalVisits: visits.length, byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  }
}
