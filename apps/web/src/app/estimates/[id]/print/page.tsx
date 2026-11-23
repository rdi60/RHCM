"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatIstDate } from "@/lib/ist";
import type { EntitySettings, EntitySummary, EstimateRow, PatientRow } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function EstimatePrintPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { selectedEntityId } = useAuth();
  const entityId = searchParams.get("entityId") ?? selectedEntityId;

  const estimateQuery = useQuery({
    queryKey: ["estimate-print", params.id, entityId],
    queryFn: () => api.get<EstimateRow>(`/estimates/${params.id}?entityId=${entityId}`),
    enabled: Boolean(entityId),
  });
  const patientQuery = useQuery({
    queryKey: ["patient", estimateQuery.data?.patientId, entityId],
    queryFn: () => api.get<PatientRow>(`/patients/${estimateQuery.data!.patientId}?entityId=${entityId}`),
    enabled: Boolean(estimateQuery.data && entityId),
  });
  const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: () => api.get<EntitySummary[]>("/entities") });
  const settingsQuery = useQuery({
    queryKey: ["entity-settings", entityId],
    queryFn: () => api.get<EntitySettings>(`/entities/${entityId}/settings`),
    enabled: Boolean(entityId),
  });

  if (estimateQuery.isLoading || !estimateQuery.data) return <p className="p-6 text-muted-foreground">Loading…</p>;
  const estimate = estimateQuery.data;
  const patient = patientQuery.data;
  const entity = entitiesQuery.data?.find((e) => e.id === entityId);
  const settings = settingsQuery.data;

  return (
    <div className="mx-auto max-w-3xl p-8 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>

      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold">{entity?.displayName ?? "Estimate"}</h1>
          {settings?.gstin && <p className="text-sm text-muted-foreground">GSTIN: {settings.gstin}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-lg font-semibold">TREATMENT ESTIMATE</h2>
          <p className="text-sm text-muted-foreground">
            {estimate.estimateNumber} (v{estimate.version}) · {formatIstDate(estimate.createdAt)}
          </p>
          <p className="text-sm font-medium">{estimate.status}</p>
          {estimate.validUntil && <p className="text-sm text-muted-foreground">Valid until {formatIstDate(estimate.validUntil)}</p>}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm text-muted-foreground">Prepared for</p>
        <p className="font-medium">{patient?.fullName ?? "—"}</p>
        <p className="text-sm text-muted-foreground">
          {patient?.uhid} {patient?.phone ? `· ${patient.phone}` : ""}
        </p>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2">Procedure</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            <th className="py-2 text-right">Discount</th>
            <th className="py-2 text-right">Line total</th>
          </tr>
        </thead>
        <tbody>
          {estimate.items.map((item) => (
            <tr key={item.id} className="border-b border-border/60">
              <td className="py-2">
                {item.treatmentCatalog?.name ?? "Item"} {item.toothNumber ? `(Tooth ${item.toothNumber})` : ""}
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
          <dd className="text-right">₹{estimate.grossTotal}</dd>
          <dt className="text-muted-foreground">Discount</dt>
          <dd className="text-right">₹{estimate.discountTotal}</dd>
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="text-right">₹{estimate.taxTotal}</dd>
          <dt className="font-semibold">Net total</dt>
          <dd className="text-right font-semibold">₹{estimate.netTotal}</dd>
        </dl>
      </div>
    </div>
  );
}
