"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import { formatIstTime, todayIstDateParam } from "@/lib/ist";
import type { VisitRow, VisitStatus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const NEXT: Partial<Record<VisitStatus, { label: string; to: VisitStatus; variant?: "default" | "destructive" }[]>> = {
  WAITING: [
    { label: "Start treatment", to: "IN_TREATMENT" },
    { label: "Cancel", to: "CANCELLED", variant: "destructive" },
  ],
  IN_TREATMENT: [
    { label: "Complete", to: "COMPLETED" },
    { label: "Cancel", to: "CANCELLED", variant: "destructive" },
  ],
};

const STATUS_VARIANT: Record<VisitStatus, "default" | "muted" | "success"> = {
  WAITING: "default",
  IN_TREATMENT: "default",
  COMPLETED: "success",
  CANCELLED: "muted",
};

export default function VisitsPage() {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const canAct = hasPermission(PERMISSIONS.APPOINTMENT_BOOK);
  const today = todayIstDateParam();

  const visitsQuery = useQuery({
    queryKey: ["visits", selectedEntityId, today],
    queryFn: () => api.get<VisitRow[]>(`/visits?entityId=${selectedEntityId}&date=${today}`),
    enabled: Boolean(selectedEntityId),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: VisitStatus }) =>
      api.patch(`/visits/${id}/status`, { entityId: selectedEntityId, status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["visits", selectedEntityId, today] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to update"),
  });

  const active = (visitsQuery.data ?? []).filter((v) => v.status === "WAITING" || v.status === "IN_TREATMENT");
  const done = (visitsQuery.data ?? []).filter((v) => v.status === "COMPLETED" || v.status === "CANCELLED");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Today's Waiting List</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>In progress</CardTitle>
          <CardDescription>Checked-in patients waiting for or currently in treatment.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {active.length === 0 && <p className="text-sm text-muted-foreground">Nobody waiting.</p>}
          {active.map((visit) => (
            <div key={visit.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="font-medium">
                  {visit.patient?.fullName} <span className="text-muted-foreground">({visit.visitNumber})</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Checked in {formatIstTime(visit.checkedInAt)}
                  {visit.doctor ? ` · ${visit.doctor.fullName}` : " · No doctor assigned"}
                  {visit.resource ? ` · ${visit.resource.label ?? `${visit.resource.type} ${visit.resource.number}`}` : ""}
                </p>
                {visit.chiefComplaint && <p className="text-sm text-muted-foreground">{visit.chiefComplaint}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[visit.status]}>{visit.status.replace("_", " ")}</Badge>
                {canAct &&
                  (NEXT[visit.status] ?? []).map((action) => (
                    <Button
                      key={action.to}
                      size="sm"
                      variant={action.variant ?? "outline"}
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: visit.id, status: action.to })}
                    >
                      {action.label}
                    </Button>
                  ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed today</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {done.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          {done.map((visit) => (
            <div key={visit.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
              <span>
                {visit.patient?.fullName} ({visit.visitNumber})
              </span>
              <Badge variant={STATUS_VARIANT[visit.status]}>{visit.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
