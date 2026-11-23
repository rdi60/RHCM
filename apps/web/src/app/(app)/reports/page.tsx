"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { CollectionsReport, DoctorProductionReport, OutstandingBalancesReport, VisitFootfallReport } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatIstDate } from "@/lib/ist";

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function EntityLabel({ entityCode }: { entityCode?: string }) {
  if (!entityCode) return null;
  return <Badge variant="muted">{entityCode}</Badge>;
}

export default function ReportsPage() {
  const { user, selectedEntityId, currentGrant } = useAuth();
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [crossEntity, setCrossEntity] = useState(false);

  const canCrossEntity = (user?.access ?? []).some((a) => a.permissions.includes(PERMISSIONS.REPORT_CROSS_ENTITY));
  const useCombined = crossEntity && canCrossEntity;

  const collectionsQuery = useQuery({
    queryKey: ["report-collections", selectedEntityId, from, to, useCombined],
    queryFn: () =>
      useCombined
        ? api.get<CollectionsReport[]>(`/reports/collections/cross-entity?from=${from}&to=${to}`)
        : api.get<CollectionsReport>(`/reports/collections?entityId=${selectedEntityId}&from=${from}&to=${to}`).then((r) => [r]),
    enabled: Boolean(selectedEntityId),
  });

  const outstandingQuery = useQuery({
    queryKey: ["report-outstanding", selectedEntityId, useCombined],
    queryFn: () =>
      useCombined
        ? api.get<OutstandingBalancesReport[]>("/reports/outstanding-balances/cross-entity")
        : api.get<OutstandingBalancesReport>(`/reports/outstanding-balances?entityId=${selectedEntityId}`).then((r) => [r]),
    enabled: Boolean(selectedEntityId),
  });

  const doctorQuery = useQuery({
    queryKey: ["report-doctor-production", selectedEntityId, from, to, useCombined],
    queryFn: () =>
      useCombined
        ? api.get<DoctorProductionReport[]>(`/reports/doctor-production/cross-entity?from=${from}&to=${to}`)
        : api.get<DoctorProductionReport>(`/reports/doctor-production?entityId=${selectedEntityId}&from=${from}&to=${to}`).then((r) => [r]),
    enabled: Boolean(selectedEntityId),
  });

  const visitsQuery = useQuery({
    queryKey: ["report-visits", selectedEntityId, from, to, useCombined],
    queryFn: () =>
      useCombined
        ? api.get<VisitFootfallReport[]>(`/reports/visits/cross-entity?from=${from}&to=${to}`)
        : api.get<VisitFootfallReport>(`/reports/visits?entityId=${selectedEntityId}&from=${from}&to=${to}`).then((r) => [r]),
    enabled: Boolean(selectedEntityId),
  });

  if (!selectedEntityId) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-heading-page">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {useCombined ? "Combined across every entity you have access to" : `Scoped to ${currentGrant?.entityCode ?? "this entity"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          {canCrossEntity && (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={crossEntity} onChange={(e) => setCrossEntity(e.target.checked)} />
              Combined (all entities)
            </label>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Collections</CardTitle>
          <CardDescription>Payments received, by day and by mode.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {collectionsQuery.data?.map((r, i) => (
            <div key={r.entityId ?? i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <EntityLabel entityCode={r.entityCode} />
                <p className="text-lg font-semibold">₹{r.total}</p>
                <p className="text-sm text-muted-foreground">({r.paymentCount} payments)</p>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {r.byMode.map((m) => (
                  <span key={m.mode} className="text-muted-foreground">
                    {m.mode}: ₹{m.amount}
                  </span>
                ))}
              </div>
              {r.byDay.length > 0 && (
                <table className="w-full max-w-sm text-sm">
                  <tbody>
                    {r.byDay.map((d) => (
                      <tr key={d.date} className="border-b border-border/60">
                        <td className="py-1">{formatIstDate(d.date)}</td>
                        <td className="py-1 text-right">₹{d.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outstanding Balances</CardTitle>
          <CardDescription>Issued or partially-paid invoices with money still owed.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {outstandingQuery.data?.map((r, i) => (
            <div key={r.entityId ?? i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <EntityLabel entityCode={r.entityCode} />
                <p className="text-lg font-semibold">₹{r.totalOutstanding}</p>
                <p className="text-sm text-muted-foreground">outstanding across {r.invoices.length} invoices</p>
              </div>
              {r.invoices.map((inv) => (
                <div key={inv.invoiceId} className="flex items-center justify-between text-sm">
                  <span>
                    {inv.invoiceNumber} · {inv.patient.fullName} ({inv.patient.uhid})
                  </span>
                  <span className="text-muted-foreground">
                    ₹{inv.balance} <Badge variant="muted">{inv.status.replace("_", " ")}</Badge>
                  </span>
                </div>
              ))}
              {r.invoices.length === 0 && <p className="text-sm text-muted-foreground">Nothing outstanding.</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doctor Production</CardTitle>
          <CardDescription>Invoiced amount by the doctor who performed each line, within the selected range.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {doctorQuery.data?.map((r, i) => (
            <div key={r.entityId ?? i} className="flex flex-col gap-1">
              <EntityLabel entityCode={r.entityCode} />
              {r.rows.map((row) => (
                <div key={row.doctorId ?? "unassigned"} className="flex items-center justify-between text-sm">
                  <span>{row.doctorName}</span>
                  <span className="text-muted-foreground">
                    ₹{row.amount} ({row.lineCount} lines)
                  </span>
                </div>
              ))}
              {r.rows.length === 0 && <p className="text-sm text-muted-foreground">No invoiced lines in this range.</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient Footfall</CardTitle>
          <CardDescription>Visits checked in, by day.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {visitsQuery.data?.map((r, i) => (
            <div key={r.entityId ?? i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <EntityLabel entityCode={r.entityCode} />
                <p className="font-medium">{r.totalVisits} visits</p>
              </div>
              <table className="w-full max-w-md text-sm">
                <tbody>
                  {r.byDay.map((d) => (
                    <tr key={d.date} className="border-b border-border/60">
                      <td className="py-1">{formatIstDate(d.date)}</td>
                      <td className="py-1 text-right">{d.total} total</td>
                      <td className="py-1 text-right text-muted-foreground">{d.completed} completed</td>
                      <td className="py-1 text-right text-muted-foreground">{d.cancelled} cancelled</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
