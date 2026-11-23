"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { TreatmentCatalogRow, TreatmentPlanRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatIstDate } from "@/lib/ist";

interface DoctorOption {
  id: string;
  fullName: string;
}

const PLAN_QUERY_KEY = (patientId: string, entityId: string | null) => ["treatment-plans", patientId, entityId];

export function TreatmentPlanCard({ plan, patientId }: { plan: TreatmentPlanRow; patientId: string }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const canPlan = hasPermission(PERMISSIONS.CLINICAL_PLAN_TREATMENT);
  const canPerform = hasPermission(PERMISSIONS.CLINICAL_PERFORM_TREATMENT);

  const catalogQuery = useQuery({
    queryKey: ["treatment-catalog"],
    queryFn: () => api.get<TreatmentCatalogRow[]>("/treatment-catalog"),
  });
  const doctorsQuery = useQuery({
    queryKey: ["doctor-directory", selectedEntityId],
    queryFn: () => api.get<DoctorOption[]>(`/doctors/directory?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEY(patientId, selectedEntityId) });
  }

  const addItemMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(`/treatment-plans/${plan.id}/items`, { entityId: selectedEntityId, ...payload }),
    onSuccess: () => {
      invalidate();
      setShowAddItem(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to add item"),
  });

  const createSessionMutation = useMutation({
    mutationFn: (itemId: string) => api.post(`/treatment-plan-items/${itemId}/sessions`, { entityId: selectedEntityId }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create session"),
  });

  const performSessionMutation = useMutation({
    mutationFn: (sessionId: string) => api.patch(`/treatment-sessions/${sessionId}`, { entityId: selectedEntityId, status: "COMPLETED" }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to update session"),
  });

  const planStatusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/treatment-plans/${plan.id}/status`, { entityId: selectedEntityId, status }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to update plan"),
  });

  function handleAddItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const toothNumber = String(form.get("toothNumber") ?? "");
    addItemMutation.mutate({
      treatmentCatalogId: form.get("treatmentCatalogId"),
      toothNumber: toothNumber ? Number(toothNumber) : undefined,
      plannedDoctorId: String(form.get("plannedDoctorId") ?? "") || undefined,
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Treatment Plan</CardTitle>
          <CardDescription>Created {formatIstDate(plan.createdAt)}</CardDescription>
        </div>
        <Badge variant={plan.status === "COMPLETED" ? "success" : plan.status === "CANCELLED" ? "muted" : "default"}>{plan.status}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {plan.items.map((item) => (
          <div key={item.id} className="rounded-button border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {item.treatmentCatalog.name} {item.toothNumber ? `· Tooth ${item.toothNumber}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.plannedDoctor?.fullName ?? "No doctor assigned"} · Est. ₹{item.estimatedCost}
                </p>
              </div>
              <Badge variant={item.status === "COMPLETED" ? "success" : "muted"}>{item.status.replace("_", " ")}</Badge>
            </div>

            {item.sessions.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                {item.sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between text-sm">
                    <span>
                      {session.status} {session.performedByDoctor ? `· performed by ${session.performedByDoctor.fullName}` : ""}
                      {session.actualDate ? ` · ${formatIstDate(session.actualDate)}` : ""}
                    </span>
                    {canPerform && session.status !== "COMPLETED" && session.status !== "CANCELLED" && (
                      <Button size="sm" variant="outline" onClick={() => performSessionMutation.mutate(session.id)} disabled={performSessionMutation.isPending}>
                        Mark performed
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canPlan && item.status !== "COMPLETED" && item.status !== "CANCELLED" && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => createSessionMutation.mutate(item.id)}
                disabled={createSessionMutation.isPending}
              >
                + New session
              </Button>
            )}
          </div>
        ))}

        {canPlan && (
          <>
            {showAddItem ? (
              <form onSubmit={handleAddItem} className="flex flex-col gap-2 rounded-button border border-dashed border-border p-3">
                <select name="treatmentCatalogId" required className="h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm">
                  <option value="">Select procedure</option>
                  {catalogQuery.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (₹{t.defaultPrice})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input name="toothNumber" type="number" placeholder="Tooth #" className="h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm" />
                  <select name="plannedDoctorId" className="h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm">
                    <option value="">Doctor</option>
                    {doctorsQuery.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" size="sm" disabled={addItemMutation.isPending}>
                  Add item
                </Button>
              </form>
            ) : (
              <Button size="sm" variant="outline" className="self-start" onClick={() => setShowAddItem(true)}>
                + Add treatment item
              </Button>
            )}
            {plan.status === "ACTIVE" && (
              <Button size="sm" variant="ghost" className="self-start" onClick={() => planStatusMutation.mutate("COMPLETED")}>
                Mark plan completed
              </Button>
            )}
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
