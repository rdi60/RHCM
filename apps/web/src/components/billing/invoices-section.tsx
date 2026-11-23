"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { InvoiceRow, TaxProfileRow, TreatmentCatalogRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatIstDate } from "@/lib/ist";
import { DraftLineItem, LineItemsEditor, emptyLineItem } from "./line-items-editor";

function toApiItems(items: DraftLineItem[]) {
  return items
    .filter((i) => i.description && i.unitPrice !== undefined)
    .map((i) => ({
      treatmentCatalogId: i.treatmentCatalogId,
      description: i.description,
      toothNumber: i.toothNumber,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountAmount: i.discountAmount,
      taxProfileId: i.taxProfileId,
    }));
}

function statusVariant(status: InvoiceRow["status"]) {
  if (status === "PAID") return "success" as const;
  if (status === "VOID") return "muted" as const;
  if (status === "PARTIALLY_PAID") return "default" as const;
  return "default" as const;
}

export function InvoicesSection({ patientId, catalog, taxProfiles }: { patientId: string; catalog: TreatmentCatalogRow[]; taxProfiles: TaxProfileRow[] }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftLineItem[]>([emptyLineItem()]);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [correctingId, setCorrectingId] = useState<string | null>(null);

  const canCreate = hasPermission(PERMISSIONS.INVOICE_CREATE);
  const canVoid = hasPermission(PERMISSIONS.INVOICE_VOID);

  const queryKey = ["invoices", patientId, selectedEntityId];
  const invoicesQuery = useQuery({
    queryKey,
    queryFn: () => api.get<InvoiceRow[]>(`/patients/${patientId}/invoices?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["payments", patientId, selectedEntityId] });
  }

  const createMutation = useMutation({
    mutationFn: (items: DraftLineItem[]) => api.post(`/patients/${patientId}/invoices`, { entityId: selectedEntityId, items: toApiItems(items) }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setDraftItems([emptyLineItem()]);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create invoice"),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/invoices/${id}/void`, { entityId: selectedEntityId, reason }),
    onSuccess: () => {
      invalidate();
      setVoidingId(null);
      setVoidReason("");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to void invoice"),
  });

  const correctMutation = useMutation({
    mutationFn: ({ id, reason, items }: { id: string; reason: string; items: DraftLineItem[] }) =>
      api.post(`/invoices/${id}/correct`, { entityId: selectedEntityId, reason, items: toApiItems(items) }),
    onSuccess: () => {
      invalidate();
      setCorrectingId(null);
      setVoidReason("");
      setDraftItems([emptyLineItem()]);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to correct invoice"),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Posted invoices are immutable — corrections void and reissue.</CardDescription>
        </div>
        {canCreate && !showCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + New invoice
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showCreate && (
          <div className="flex flex-col gap-3 rounded-button border border-dashed border-border p-3">
            <LineItemsEditor mode="invoice" items={draftItems} onChange={setDraftItems} catalog={catalog} taxProfiles={taxProfiles} />
            <div className="flex gap-2">
              <Button size="sm" disabled={createMutation.isPending} onClick={() => createMutation.mutate(draftItems)}>
                Create invoice
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {invoicesQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}

        {invoicesQuery.data?.map((invoice) => (
          <div key={invoice.id} className="rounded-button border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{invoice.invoiceNumber}</p>
                <p className="text-sm text-muted-foreground">
                  {formatIstDate(invoice.invoiceDate)} · Net ₹{invoice.netTotal} · Paid ₹{invoice.paidAmount} · Balance ₹
                  {(Number(invoice.netTotal) - Number(invoice.paidAmount)).toFixed(2)}
                </p>
                {invoice.voidReason && <p className="text-sm text-destructive">Void reason: {invoice.voidReason}</p>}
              </div>
              <Badge variant={statusVariant(invoice.status)}>{invoice.status.replace("_", " ")}</Badge>
            </div>

            <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-sm">
              {invoice.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <span>
                    {item.description} {item.toothNumber ? `· Tooth ${item.toothNumber}` : ""} × {item.quantity}
                  </span>
                  <span className="text-muted-foreground">₹{item.lineTotal}</span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {canVoid && invoice.status !== "VOID" && !invoice.correctedByInvoiceId && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setVoidingId(invoice.id)}>
                    Void
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCorrectingId(invoice.id)}>
                    Correct
                  </Button>
                </>
              )}
              <Link
                href={`/invoices/${invoice.id}/print?entityId=${selectedEntityId}`}
                target="_blank"
                className="inline-flex h-8 items-center justify-center rounded-button px-3 text-xs font-medium transition-colors hover:bg-lavender"
              >
                Print
              </Link>
            </div>

            {voidingId === invoice.id && (
              <div className="mt-2 flex items-center gap-2">
                <Input placeholder="Reason for voiding" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                <Button
                  size="sm"
                  disabled={!voidReason || voidMutation.isPending}
                  onClick={() => voidMutation.mutate({ id: invoice.id, reason: voidReason })}
                >
                  Confirm void
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setVoidingId(null)}>
                  Cancel
                </Button>
              </div>
            )}

            {correctingId === invoice.id && (
              <div className="mt-3 flex flex-col gap-3 rounded-button border border-dashed border-border p-3">
                <p className="text-sm font-medium">Correct invoice (voids this one, issues a replacement)</p>
                <Input placeholder="Reason for correction" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                <LineItemsEditor mode="invoice" items={draftItems} onChange={setDraftItems} catalog={catalog} taxProfiles={taxProfiles} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!voidReason || correctMutation.isPending}
                    onClick={() => correctMutation.mutate({ id: invoice.id, reason: voidReason, items: draftItems })}
                  >
                    Save correction
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCorrectingId(null)}>
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
