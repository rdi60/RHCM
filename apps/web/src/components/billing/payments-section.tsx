"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { InvoiceRow, PaymentMode, PaymentRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIstDateTime } from "@/lib/ist";

const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

function paymentRemaining(payment: PaymentRow): number {
  const allocated = (payment.allocations ?? []).filter((a) => !a.reversedAt).reduce((sum, a) => sum + Number(a.amount), 0);
  return Number(payment.amount) - allocated;
}

export function PaymentsSection({ patientId }: { patientId: string }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [allocatingPaymentId, setAllocatingPaymentId] = useState<string | null>(null);
  const [allocateInvoiceId, setAllocateInvoiceId] = useState("");
  const [allocateAmount, setAllocateAmount] = useState("");
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const canReceive = hasPermission(PERMISSIONS.PAYMENT_RECEIVE);
  const canAllocate = hasPermission(PERMISSIONS.PAYMENT_ALLOCATE);

  const paymentsKey = ["payments", patientId, selectedEntityId];
  const paymentsQuery = useQuery({
    queryKey: paymentsKey,
    queryFn: () => api.get<PaymentRow[]>(`/patients/${patientId}/payments?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const invoicesQuery = useQuery({
    queryKey: ["invoices", patientId, selectedEntityId],
    queryFn: () => api.get<InvoiceRow[]>(`/patients/${patientId}/invoices?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });
  const invoicesWithBalance = (invoicesQuery.data ?? []).filter(
    (inv) => inv.status !== "VOID" && Number(inv.netTotal) - Number(inv.paidAmount) > 0,
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: paymentsKey });
    queryClient.invalidateQueries({ queryKey: ["invoices", patientId, selectedEntityId] });
  }

  const recordMutation = useMutation({
    mutationFn: (payload: { amount: number; mode: PaymentMode; transactionReference?: string; remarks?: string }) =>
      api.post(`/patients/${patientId}/payments`, {
        entityId: selectedEntityId,
        idempotencyKey: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        ...payload,
      }),
    onSuccess: () => {
      invalidate();
      setShowRecord(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to record payment"),
  });

  const allocateMutation = useMutation({
    mutationFn: ({ paymentId, invoiceId, amount }: { paymentId: string; invoiceId: string; amount: number }) =>
      api.post(`/payments/${paymentId}/allocations`, { entityId: selectedEntityId, invoiceId, amount }),
    onSuccess: () => {
      invalidate();
      setAllocatingPaymentId(null);
      setAllocateInvoiceId("");
      setAllocateAmount("");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to allocate payment"),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ allocationId, reason }: { allocationId: string; reason: string }) =>
      api.post(`/payment-allocations/${allocationId}/reverse`, { entityId: selectedEntityId, reason }),
    onSuccess: () => {
      invalidate();
      setReversingId(null);
      setReverseReason("");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to reverse allocation"),
  });

  function handleRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    recordMutation.mutate({
      amount: Number(form.get("amount")),
      mode: String(form.get("mode")) as PaymentMode,
      transactionReference: String(form.get("transactionReference") ?? "") || undefined,
      remarks: String(form.get("remarks") ?? "") || undefined,
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Payments & Receipts</CardTitle>
          <CardDescription>Record money received, then allocate it to one or more invoices.</CardDescription>
        </div>
        {canReceive && !showRecord && (
          <Button size="sm" onClick={() => setShowRecord(true)}>
            + Record payment
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showRecord && (
          <form onSubmit={handleRecord} className="flex flex-col gap-3 rounded-button border border-dashed border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" min={0.01} step="0.01" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mode">Mode</Label>
                <select id="mode" name="mode" required className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm">
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="transactionReference">Reference (optional)</Label>
                <Input id="transactionReference" name="transactionReference" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="remarks">Remarks (optional)</Label>
                <Input id="remarks" name="remarks" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={recordMutation.isPending}>
                Record payment
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowRecord(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {paymentsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}

        {paymentsQuery.data?.map((payment) => {
          const remaining = paymentRemaining(payment);
          return (
            <div key={payment.id} className="rounded-button border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    ₹{payment.amount} · {payment.mode.replace("_", " ")} {payment.receipt ? `· ${payment.receipt.receiptNumber}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatIstDateTime(payment.paymentDate)} {payment.transactionReference ? `· Ref ${payment.transactionReference}` : ""}
                  </p>
                </div>
                <Badge variant={remaining > 0 ? "default" : "success"}>{remaining > 0 ? `Unallocated ₹${remaining.toFixed(2)}` : "Fully allocated"}</Badge>
              </div>

              {(payment.allocations?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-sm">
                  {payment.allocations!.map((a) => (
                    <div key={a.id} className="flex items-center justify-between">
                      <span className={a.reversedAt ? "text-muted-foreground line-through" : ""}>
                        {a.invoice?.invoiceNumber ?? a.invoiceId} · ₹{a.amount}
                      </span>
                      {canAllocate && !a.reversedAt && (
                        <Button size="sm" variant="ghost" onClick={() => setReversingId(a.id)}>
                          Reverse
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {reversingId && payment.allocations?.some((a) => a.id === reversingId) && (
                <div className="mt-2 flex items-center gap-2">
                  <Input placeholder="Reason for reversal" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
                  <Button
                    size="sm"
                    disabled={!reverseReason || reverseMutation.isPending}
                    onClick={() => reverseMutation.mutate({ allocationId: reversingId, reason: reverseReason })}
                  >
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReversingId(null)}>
                    Cancel
                  </Button>
                </div>
              )}

              {canAllocate && remaining > 0 && (
                <div className="mt-2">
                  {allocatingPaymentId === payment.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
                        value={allocateInvoiceId}
                        onChange={(e) => setAllocateInvoiceId(e.target.value)}
                      >
                        <option value="">Select invoice</option>
                        {invoicesWithBalance.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoiceNumber} (balance ₹{(Number(inv.netTotal) - Number(inv.paidAmount)).toFixed(2)})
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={0.01}
                        step="0.01"
                        className="w-28"
                        placeholder="Amount"
                        value={allocateAmount}
                        onChange={(e) => setAllocateAmount(e.target.value)}
                      />
                      <Button
                        size="sm"
                        disabled={!allocateInvoiceId || !allocateAmount || allocateMutation.isPending}
                        onClick={() =>
                          allocateMutation.mutate({ paymentId: payment.id, invoiceId: allocateInvoiceId, amount: Number(allocateAmount) })
                        }
                      >
                        Allocate
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAllocatingPaymentId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setAllocatingPaymentId(payment.id)}>
                      Allocate to invoice
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
