"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { EstimateRow, TaxProfileRow, TreatmentCatalogRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatIstDate } from "@/lib/ist";
import { DraftLineItem, LineItemsEditor, emptyLineItem } from "./line-items-editor";

function toApiItems(items: DraftLineItem[]) {
  return items
    .filter((i) => i.treatmentCatalogId)
    .map((i) => ({
      treatmentCatalogId: i.treatmentCatalogId,
      toothNumber: i.toothNumber,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountAmount: i.discountAmount,
      taxProfileId: i.taxProfileId,
    }));
}

function statusVariant(status: EstimateRow["status"]) {
  if (status === "ACCEPTED" || status === "CONVERTED") return "success" as const;
  if (status === "REJECTED" || status === "EXPIRED" || status === "SUPERSEDED") return "muted" as const;
  return "default" as const;
}

export function EstimatesSection({ patientId, catalog, taxProfiles }: { patientId: string; catalog: TreatmentCatalogRow[]; taxProfiles: TaxProfileRow[] }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftLineItem[]>([emptyLineItem()]);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertQty, setConvertQty] = useState<Record<string, number>>({});

  const canCreate = hasPermission(PERMISSIONS.ESTIMATE_CREATE);
  const canApprove = hasPermission(PERMISSIONS.ESTIMATE_APPROVE);
  const canInvoice = hasPermission(PERMISSIONS.INVOICE_CREATE);

  const queryKey = ["estimates", patientId, selectedEntityId];
  const estimatesQuery = useQuery({
    queryKey,
    queryFn: () => api.get<EstimateRow[]>(`/patients/${patientId}/estimates?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["invoices", patientId, selectedEntityId] });
  }

  const createMutation = useMutation({
    mutationFn: (items: DraftLineItem[]) => api.post(`/patients/${patientId}/estimates`, { entityId: selectedEntityId, items: toApiItems(items) }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setDraftItems([emptyLineItem()]);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create estimate"),
  });

  const reviseMutation = useMutation({
    mutationFn: ({ id, items }: { id: string; items: DraftLineItem[] }) => api.post(`/estimates/${id}/revise`, { entityId: selectedEntityId, items: toApiItems(items) }),
    onSuccess: () => {
      invalidate();
      setRevisingId(null);
      setDraftItems([emptyLineItem()]);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to revise estimate"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/estimates/${id}/status`, { entityId: selectedEntityId, status }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to update estimate"),
  });

  const convertMutation = useMutation({
    mutationFn: ({ id, selections }: { id: string; selections: Array<{ estimateItemId: string; quantity: number }> }) =>
      api.post(`/estimates/${id}/invoices`, { entityId: selectedEntityId, selections }),
    onSuccess: () => {
      invalidate();
      setConvertingId(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to convert to invoice"),
  });

  function startRevise(estimate: EstimateRow) {
    setRevisingId(estimate.id);
    setDraftItems(
      estimate.items.map((i) => ({
        treatmentCatalogId: i.treatmentCatalogId,
        description: i.treatmentCatalog?.name ?? "",
        toothNumber: i.toothNumber ?? undefined,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        discountAmount: Number(i.discountAmount),
        taxProfileId: i.taxProfileId ?? undefined,
      })),
    );
  }

  function startConvert(estimate: EstimateRow) {
    setConvertingId(estimate.id);
    const defaults: Record<string, number> = {};
    for (const item of estimate.items) {
      const remaining = item.quantity - item.invoicedQuantity;
      if (remaining > 0) defaults[item.id] = remaining;
    }
    setConvertQty(defaults);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Estimates</CardTitle>
          <CardDescription>Treatment cost estimates — approve, then convert to an invoice.</CardDescription>
        </div>
        {canCreate && !showCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + New estimate
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showCreate && (
          <div className="flex flex-col gap-3 rounded-button border border-dashed border-border p-3">
            <LineItemsEditor mode="estimate" items={draftItems} onChange={setDraftItems} catalog={catalog} taxProfiles={taxProfiles} />
            <div className="flex gap-2">
              <Button size="sm" disabled={createMutation.isPending} onClick={() => createMutation.mutate(draftItems)}>
                Create estimate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {estimatesQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No estimates yet.</p>}

        {estimatesQuery.data?.map((estimate) => (
          <div key={estimate.id} className="rounded-button border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {estimate.estimateNumber} {estimate.version > 1 ? `(v${estimate.version})` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatIstDate(estimate.createdAt)} · Net ₹{estimate.netTotal}
                </p>
              </div>
              <Badge variant={statusVariant(estimate.status)}>{estimate.status}</Badge>
            </div>

            <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-sm">
              {estimate.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <span>
                    {item.treatmentCatalog?.name ?? "Item"} {item.toothNumber ? `· Tooth ${item.toothNumber}` : ""} × {item.quantity}
                  </span>
                  <span className="text-muted-foreground">
                    ₹{item.lineTotal} {item.invoicedQuantity > 0 ? `· invoiced ${item.invoicedQuantity}/${item.quantity}` : ""}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {canApprove && estimate.status === "DRAFT" && (
                <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: estimate.id, status: "SENT" })}>
                  Mark sent
                </Button>
              )}
              {canApprove && estimate.status === "SENT" && (
                <>
                  <Button size="sm" onClick={() => statusMutation.mutate({ id: estimate.id, status: "ACCEPTED" })}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: estimate.id, status: "REJECTED" })}>
                    Reject
                  </Button>
                </>
              )}
              {canInvoice && estimate.status === "ACCEPTED" && (
                <Button size="sm" onClick={() => startConvert(estimate)}>
                  Convert to invoice
                </Button>
              )}
              {canCreate && estimate.status !== "CONVERTED" && estimate.status !== "SUPERSEDED" && (
                <Button size="sm" variant="ghost" onClick={() => startRevise(estimate)}>
                  Revise
                </Button>
              )}
              <Link
                href={`/estimates/${estimate.id}/print?entityId=${selectedEntityId}`}
                target="_blank"
                className="inline-flex h-8 items-center justify-center rounded-button px-3 text-xs font-medium transition-colors hover:bg-lavender"
              >
                Print
              </Link>
            </div>

            {revisingId === estimate.id && (
              <div className="mt-3 flex flex-col gap-3 rounded-button border border-dashed border-border p-3">
                <p className="text-sm font-medium">Revise estimate (creates v{estimate.version + 1}, supersedes this one)</p>
                <LineItemsEditor mode="estimate" items={draftItems} onChange={setDraftItems} catalog={catalog} taxProfiles={taxProfiles} />
                <div className="flex gap-2">
                  <Button size="sm" disabled={reviseMutation.isPending} onClick={() => reviseMutation.mutate({ id: estimate.id, items: draftItems })}>
                    Save revision
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRevisingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {convertingId === estimate.id && (
              <div className="mt-3 flex flex-col gap-3 rounded-button border border-dashed border-border p-3">
                <p className="text-sm font-medium">Select quantities to invoice</p>
                {estimate.items
                  .filter((i) => i.quantity - i.invoicedQuantity > 0)
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {item.treatmentCatalog?.name} (remaining {item.quantity - item.invoicedQuantity})
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={item.quantity - item.invoicedQuantity}
                        className="h-8 w-20 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
                        value={convertQty[item.id] ?? 0}
                        onChange={(e) => setConvertQty((q) => ({ ...q, [item.id]: Number(e.target.value) || 0 }))}
                      />
                    </div>
                  ))}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={convertMutation.isPending}
                    onClick={() =>
                      convertMutation.mutate({
                        id: estimate.id,
                        selections: Object.entries(convertQty)
                          .filter(([, qty]) => qty > 0)
                          .map(([estimateItemId, quantity]) => ({ estimateItemId, quantity })),
                      })
                    }
                  >
                    Create invoice
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConvertingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
