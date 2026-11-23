"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { PaymentMode, PaymentRow, RefundRow } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIstDate } from "@/lib/ist";
import { formatStatus } from "@/lib/utils";

const PAYMENT_MODES: PaymentMode[] = [
  "CASH",
  "UPI",
  "CARD",
  "BANK_TRANSFER",
  "OTHER",
];

function statusVariant(status: RefundRow["status"]) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "REJECTED") return "muted" as const;
  return "default" as const;
}

export function RefundsSection({ patientId }: { patientId: string }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const canRequest = hasPermission(PERMISSIONS.PAYMENT_ALLOCATE);
  const canApprove = hasPermission(PERMISSIONS.REFUND_APPROVE);

  const queryKey = ["refunds", patientId, selectedEntityId];
  const refundsQuery = useQuery({
    queryKey,
    queryFn: () =>
      api.get<RefundRow[]>(
        `/patients/${patientId}/refunds?entityId=${selectedEntityId}`,
      ),
    enabled: Boolean(selectedEntityId),
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments", patientId, selectedEntityId],
    queryFn: () =>
      api.get<PaymentRow[]>(
        `/patients/${patientId}/payments?entityId=${selectedEntityId}`,
      ),
    enabled: Boolean(selectedEntityId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
  }

  const createMutation = useMutation({
    mutationFn: (payload: {
      paymentId?: string;
      amount: number;
      reason: string;
      mode: PaymentMode;
    }) =>
      api.post(`/patients/${patientId}/refunds`, {
        entityId: selectedEntityId,
        ...payload,
      }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Failed to request refund",
      ),
  });

  const actionMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "approve" | "complete" | "reject";
    }) => api.patch(`/refunds/${id}/${action}`, { entityId: selectedEntityId }),
    onSuccess: invalidate,
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Failed to update refund",
      ),
  });

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      paymentId: String(form.get("paymentId") ?? "") || undefined,
      amount: Number(form.get("amount")),
      reason: String(form.get("reason") ?? ""),
      mode: String(form.get("mode")) as PaymentMode,
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Refunds</CardTitle>
          <CardDescription>
            Request → approve → complete, so no single person both authorizes
            and pays out a refund alone.
          </CardDescription>
        </div>
        {canRequest && !showCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + Request refund
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 rounded-button border border-dashed border-border p-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rf-payment">Payment (optional)</Label>
                <select
                  id="rf-payment"
                  name="paymentId"
                  className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm"
                >
                  <option value="">Not tied to a specific payment</option>
                  {paymentsQuery.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      ₹{p.amount} · {p.mode} ({formatIstDate(p.paymentDate)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rf-amount">Amount</Label>
                <Input
                  id="rf-amount"
                  name="amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rf-mode">Refund mode</Label>
                <select
                  id="rf-mode"
                  name="mode"
                  required
                  className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm"
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rf-reason">Reason</Label>
                <Input id="rf-reason" name="reason" required />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending}
              >
                Request refund
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {refundsQuery.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No refunds yet.</p>
        )}

        {refundsQuery.data && refundsQuery.data.length > 0 && (
          <div className="divide-y divide-border text-sm">
            {refundsQuery.data.map((refund) => (
              <div
                key={refund.id}
                className="flex items-center justify-between py-3 first:pt-0"
              >
                <div>
                  <p className="font-medium">
                    ₹{refund.amount} · {formatStatus(refund.mode)}
                  </p>
                  <p className="text-muted-foreground">
                    {formatIstDate(refund.requestedAt)} · {refund.reason}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(refund.status)}>
                    {formatStatus(refund.status)}
                  </Badge>
                  {canApprove && refund.status === "REQUESTED" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          actionMutation.mutate({
                            id: refund.id,
                            action: "approve",
                          })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          actionMutation.mutate({
                            id: refund.id,
                            action: "reject",
                          })
                        }
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {canApprove && refund.status === "APPROVED" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        actionMutation.mutate({
                          id: refund.id,
                          action: "complete",
                        })
                      }
                    >
                      Complete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
