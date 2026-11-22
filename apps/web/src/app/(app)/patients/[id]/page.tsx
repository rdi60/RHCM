"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import { formatIstDate, formatIstDateTime } from "@/lib/ist";
import type { AppointmentRow, PatientRow, TreatmentPlanRow, VisitRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TreatmentPlanCard } from "@/components/clinical/treatment-plan-card";
import { cn } from "@/lib/utils";

const TABS = ["Overview", "Visits", "Appointments", "Treatment Plans"] as const;
type Tab = (typeof TABS)[number];

export default function PatientDashboardPage() {
  const params = useParams<{ id: string }>();
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const canEdit = hasPermission(PERMISSIONS.PATIENT_REGISTER);

  const patientQuery = useQuery({
    queryKey: ["patient", params.id, selectedEntityId],
    queryFn: () => api.get<PatientRow>(`/patients/${params.id}?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const visitsQuery = useQuery({
    queryKey: ["patient-visits", params.id, selectedEntityId],
    queryFn: () => api.get<VisitRow[]>(`/visits?entityId=${selectedEntityId}&patientId=${params.id}`),
    enabled: Boolean(selectedEntityId) && tab === "Visits",
  });

  const appointmentsQuery = useQuery({
    queryKey: ["patient-appointments", params.id, selectedEntityId],
    queryFn: () => api.get<AppointmentRow[]>(`/appointments?entityId=${selectedEntityId}&patientId=${params.id}`),
    enabled: Boolean(selectedEntityId) && tab === "Appointments",
  });

  const plansQuery = useQuery({
    queryKey: ["treatment-plans", params.id, selectedEntityId],
    queryFn: () => api.get<TreatmentPlanRow[]>(`/patients/${params.id}/treatment-plans?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId) && tab === "Treatment Plans",
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch(`/patients/${params.id}`, { entityId: selectedEntityId, ...payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["patient", params.id, selectedEntityId] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to save"),
  });

  if (patientQuery.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!patientQuery.data) return <p className="text-destructive">Patient not found for this entity.</p>;
  const patient = patientQuery.data;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const toList = (key: string) =>
      String(form.get(key) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    updateMutation.mutate({
      phone: String(form.get("phone") ?? "") || null,
      email: String(form.get("email") ?? "") || null,
      allergiesJson: toList("allergies"),
      medicalAlertsJson: toList("medicalAlerts"),
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{patient.fullName}</h1>
        <Badge>{patient.uhid}</Badge>
      </div>

      {(patient.allergiesJson?.length || patient.medicalAlertsJson?.length) ? (
        <div className="flex flex-wrap gap-2">
          {patient.allergiesJson?.map((a) => (
            <Badge key={a} variant="destructive">
              Allergy: {a}
            </Badge>
          ))}
          {patient.medicalAlertsJson?.map((a) => (
            <Badge key={a} variant="destructive">
              Alert: {a}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>
                {patient.gender !== "UNSPECIFIED" ? patient.gender.charAt(0) + patient.gender.slice(1).toLowerCase() : "Gender not specified"}
                {patient.dob ? ` · DOB ${new Date(patient.dob).toLocaleDateString("en-IN")}` : patient.ageYears ? ` · Age ${patient.ageYears}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" name="phone" defaultValue={patient.phone ?? ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" defaultValue={patient.email ?? ""} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="allergies">Allergies (comma-separated)</Label>
                    <Input id="allergies" name="allergies" defaultValue={(patient.allergiesJson ?? []).join(", ")} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="medicalAlerts">Medical alerts (comma-separated)</Label>
                    <Input id="medicalAlerts" name="medicalAlerts" defaultValue={(patient.medicalAlertsJson ?? []).join(", ")} />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div>
                    <Button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{patient.phone ?? "—"}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{patient.email ?? "—"}</dd>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registered at</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {patient.entityLinks?.map((l) => (
                <Badge key={l.id} variant="muted">
                  {l.entity.code}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "Visits" && (
        <Card>
          <CardHeader>
            <CardTitle>Visit history</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {visitsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No visits yet.</p>}
            {[...(visitsQuery.data ?? [])].reverse().map((v) => (
              <Link key={v.id} href={`/visits/${v.id}`} className="flex items-center justify-between rounded-md border border-border p-3 text-sm hover:bg-muted">
                <div>
                  <p className="font-medium">{v.visitNumber}</p>
                  <p className="text-muted-foreground">
                    {formatIstDateTime(v.checkedInAt)} {v.doctor ? `· ${v.doctor.fullName}` : ""}
                    {v.chiefComplaint ? ` · ${v.chiefComplaint}` : ""}
                  </p>
                </div>
                <Badge variant={v.status === "COMPLETED" ? "success" : "muted"}>{v.status.replace("_", " ")}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "Appointments" && (
        <Card>
          <CardHeader>
            <CardTitle>Appointment history</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {appointmentsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No appointments yet.</p>}
            {appointmentsQuery.data?.map((a) => (
              <Link key={a.id} href={`/appointments/${a.id}`} className="flex items-center justify-between rounded-md border border-border p-3 text-sm hover:bg-muted">
                <div>
                  <p className="font-medium">{formatIstDateTime(a.startAt)}</p>
                  <p className="text-muted-foreground">
                    {a.doctor?.fullName} {a.resource ? `· ${a.resource.label ?? `${a.resource.type} ${a.resource.number}`}` : ""}
                  </p>
                </div>
                <Badge variant="muted">{a.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "Treatment Plans" && (
        <div className="flex flex-col gap-4">
          {plansQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No treatment plans yet.</p>}
          {plansQuery.data?.map((plan) => (
            <TreatmentPlanCard key={plan.id} plan={plan} patientId={params.id} />
          ))}
        </div>
      )}
    </div>
  );
}
