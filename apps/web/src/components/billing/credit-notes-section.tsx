"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { CreditNoteRow, InvoiceRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIstDate } from "@/lib/ist";

export function CreditNotesSection({ patientId }: { patientId: string }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const canManage = hasPermission(PERMISSIONS.INVOICE_VOID);

  const queryKey = ["credit-notes", patientId, selectedEntityId];
  const creditNotesQuery = useQuery({
    queryKey,
    queryFn: () => api.get<CreditNoteRow[]>(`/patients/${patientId}/credit-notes?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const invoicesQuery = useQuery({
    queryKey: ["invoices", patientId, selectedEntityId],
    queryFn: () => api.get<InvoiceRow[]>(`/patients/${patientId}/invoices?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["invoices", patientId, selectedEntityId] });
  }

  const createMutation = useMutation({
    mutationFn: (payload: { invoiceId?: string; amount: number; reason: string }) =>
      api.post(`/patients/${patientId}/credit-notes`, { entityId: selectedEntityId, ...payload }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to issue credit note"),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => api.post(`/credit-notes/${id}/void`, { entityId: selectedEntityId }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to void credit note"),
  });

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      invoiceId: String(form.get("invoiceId") ?? "") || undefined,
      amount: Number(form.get("amount")),
      reason: String(form.get("reason") ?? ""),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Credit Notes</CardTitle>
          <CardDescription>Reduces what a patient owes without reversing a payment allocation.</CardDescription>
        </div>
        {canManage && !showCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + Issue credit note
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showCreate && (
          <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cn-invoice">Invoice (optional)</Label>
                <select id="cn-invoice" name="invoiceId" className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                  <option value="">General credit</option>
                  {invoicesQuery.data
                    ?.filter((i) => i.status !== "VOID")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNumber}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cn-amount">Amount</Label>
                <Input id="cn-amount" name="amount" type="number" min={0.01} step="0.01" required />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="cn-reason">Reason</Label>
                <Input id="cn-reason" name="reason" required />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                Issue
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {creditNotesQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No credit notes yet.</p>}

        {creditNotesQuery.data?.map((note) => (
          <div key={note.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
            <div>
              <p className="font-medium">₹{note.amount}</p>
              <p className="text-muted-foreground">
                {formatIstDate(note.issuedAt)} · {note.reason}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={note.status === "VOID" ? "muted" : "default"}>{note.status}</Badge>
              {canManage && note.status === "ISSUED" && (
                <Button size="sm" variant="ghost" onClick={() => voidMutation.mutate(note.id)}>
                  Void
                </Button>
              )}
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
