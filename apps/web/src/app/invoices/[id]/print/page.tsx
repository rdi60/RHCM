"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatIstDate } from "@/lib/ist";
import type { EntitySettings, EntitySummary, InvoiceRow, PatientRow } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function InvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { selectedEntityId } = useAuth();
  const entityId = searchParams.get("entityId") ?? selectedEntityId;

  const invoiceQuery = useQuery({
    queryKey: ["invoice-print", params.id, entityId],
    queryFn: () => api.get<InvoiceRow>(`/invoices/${params.id}?entityId=${entityId}`),
    enabled: Boolean(entityId),
  });
  const patientQuery = useQuery({
    queryKey: ["patient", invoiceQuery.data?.patientId, entityId],
    queryFn: () => api.get<PatientRow>(`/patients/${invoiceQuery.data!.patientId}?entityId=${entityId}`),
    enabled: Boolean(invoiceQuery.data && entityId),
  });
  const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: () => api.get<EntitySummary[]>("/entities") });
  const settingsQuery = useQuery({
    queryKey: ["entity-settings", entityId],
    queryFn: () => api.get<EntitySettings>(`/entities/${entityId}/settings`),
    enabled: Boolean(entityId),
  });

  if (invoiceQuery.isLoading || !invoiceQuery.data) return <p className="p-6 text-muted-foreground">Loading…</p>;
  const invoice = invoiceQuery.data;
  const patient = patientQuery.data;
  const entity = entitiesQuery.data?.find((e) => e.id === entityId);
  const settings = settingsQuery.data;
  const balance = Number(invoice.netTotal) - Number(invoice.paidAmount);

  return (
    <div className="mx-auto max-w-3xl p-8 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>

      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold">{entity?.displayName ?? "Invoice"}</h1>
          {settings?.gstin && <p className="text-sm text-muted-foreground">GSTIN: {settings.gstin}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-lg font-semibold">TAX INVOICE</h2>
          <p className="text-sm text-muted-foreground">
            {invoice.invoiceNumber} · {formatIstDate(invoice.invoiceDate)}
          </p>
          {invoice.status === "VOID" && <p className="text-sm font-medium text-destructive">VOID</p>}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm text-muted-foreground">Billed to</p>
        <p className="font-medium">{patient?.fullName ?? "—"}</p>
        <p className="text-sm text-muted-foreground">
          {patient?.uhid} {patient?.phone ? `· ${patient.phone}` : ""}
        </p>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            <th className="py-2 text-right">Discount</th>
            <th className="py-2 text-right">Line total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id} className="border-b border-border/60">
              <td className="py-2">
                {item.description} {item.toothNumber ? `(Tooth ${item.toothNumber})` : ""}
              </td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right">₹{item.unitPrice}</td>
              <td className="py-2 text-right">₹{item.discountAmount}</td>
              <td className="py-2 text-right">₹{item.lineTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Gross</dt>
          <dd className="text-right">₹{invoice.grossTotal}</dd>
          <dt className="text-muted-foreground">Discount</dt>
          <dd className="text-right">₹{invoice.discountTotal}</dd>
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="text-right">₹{invoice.taxTotal}</dd>
          <dt className="font-medium">Net total</dt>
          <dd className="text-right font-medium">₹{invoice.netTotal}</dd>
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="text-right">₹{invoice.paidAmount}</dd>
          <dt className="font-semibold">Balance due</dt>
          <dd className="text-right font-semibold">₹{balance.toFixed(2)}</dd>
        </dl>
      </div>
    </div>
  );
}
