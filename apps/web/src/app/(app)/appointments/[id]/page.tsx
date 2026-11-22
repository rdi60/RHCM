"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import { formatIstDateTime } from "@/lib/ist";
import type { AppointmentRow, AppointmentStatus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const NEXT_ACTIONS: Partial<Record<AppointmentStatus, { label: string; to: AppointmentStatus; variant?: "default" | "destructive" }[]>> = {
  BOOKED: [
    { label: "Confirm", to: "CONFIRMED" },
    { label: "Mark arrived", to: "ARRIVED" },
    { label: "Cancel", to: "CANCELLED", variant: "destructive" },
    { label: "No-show", to: "NO_SHOW", variant: "destructive" },
  ],
  CONFIRMED: [
    { label: "Mark arrived", to: "ARRIVED" },
    { label: "Cancel", to: "CANCELLED", variant: "destructive" },
    { label: "No-show", to: "NO_SHOW", variant: "destructive" },
  ],
  ARRIVED: [
    { label: "Check in", to: "CHECKED_IN" },
    { label: "Cancel", to: "CANCELLED", variant: "destructive" },
  ],
};

export default function AppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const canBook = hasPermission(PERMISSIONS.APPOINTMENT_BOOK);

  const apptQuery = useQuery({
    queryKey: ["appointment", params.id, selectedEntityId],
    queryFn: () => api.get<AppointmentRow>(`/appointments/${params.id}?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const statusMutation = useMutation({
    mutationFn: (status: AppointmentStatus) => api.patch(`/appointments/${params.id}/status`, { entityId: selectedEntityId, status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointment", params.id, selectedEntityId] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to update status"),
  });

  if (apptQuery.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!apptQuery.data) return <p className="text-destructive">Appointment not found.</p>;
  const appt = apptQuery.data;
  const actions = canBook ? (NEXT_ACTIONS[appt.status] ?? []) : [];

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{appt.patient?.fullName ?? appt.temporaryRegistration?.fullName}</h1>
        <Badge>{appt.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{formatIstDateTime(appt.startAt)}</CardTitle>
          <CardDescription>
            {appt.doctor?.fullName} {appt.resource ? `· ${appt.resource.label ?? `${appt.resource.type} ${appt.resource.number}`}` : "· No chair/OT assigned"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{appt.type}</dd>
            <dt className="text-muted-foreground">Reason</dt>
            <dd>{appt.procedureHint ?? "—"}</dd>
            {appt.isEmergencyOverride && (
              <>
                <dt className="text-muted-foreground">Emergency override</dt>
                <dd className="text-destructive">Yes</dd>
              </>
            )}
          </dl>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {actions.map((action) => (
                <Button
                  key={action.to}
                  variant={action.variant ?? "outline"}
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(action.to)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button variant="ghost" size="sm" className="self-start" onClick={() => router.push("/appointments")}>
        Back to calendar
      </Button>
    </div>
  );
}
