"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { PatientRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasPermission(PERMISSIONS.PATIENT_REGISTER);

  const patientQuery = useQuery({
    queryKey: ["patient", params.id, selectedEntityId],
    queryFn: () => api.get<PatientRow>(`/patients/${params.id}?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
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
    </div>
  );
}
