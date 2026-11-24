"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import { formatIstDateTime } from "@/lib/ist";
import type {
  DentalChartEntryRow,
  DiagnosisRow,
  TreatmentPlanRow,
  VisitDetailRow,
} from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatStatus } from "@/lib/utils";
import { Odontogram } from "@/components/clinical/odontogram";
import { DentalChartEntryForm } from "@/components/clinical/dental-chart-entry-form";
import { TreatmentPlanCard } from "@/components/clinical/treatment-plan-card";
import { ClinicalNotesPanel } from "@/components/clinical/clinical-notes-panel";
import { PrescriptionsPanel } from "@/components/clinical/prescriptions-panel";

export default function VisitEncounterPage() {
  const params = useParams<{ id: string }>();
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);

  const canDiagnose = hasPermission(PERMISSIONS.CLINICAL_DIAGNOSE);
  const canPlan = hasPermission(PERMISSIONS.CLINICAL_PLAN_TREATMENT);
  const canWriteSummary = hasPermission(PERMISSIONS.CLINICAL_NOTE_WRITE);

  const visitQuery = useQuery({
    queryKey: ["visit", params.id, selectedEntityId],
    queryFn: () =>
      api.get<VisitDetailRow>(
        `/visits/${params.id}?entityId=${selectedEntityId}`,
      ),
    enabled: Boolean(selectedEntityId),
  });

  const patientId = visitQuery.data?.patientId;

  const chartQuery = useQuery({
    queryKey: ["dental-chart", patientId, selectedEntityId],
    queryFn: () =>
      api.get<DentalChartEntryRow[]>(
        `/patients/${patientId}/dental-chart?entityId=${selectedEntityId}`,
      ),
    enabled: Boolean(selectedEntityId) && Boolean(patientId),
  });

  const diagnosesQuery = useQuery({
    queryKey: ["diagnoses", params.id, selectedEntityId],
    queryFn: () =>
      api.get<DiagnosisRow[]>(
        `/visits/${params.id}/diagnoses?entityId=${selectedEntityId}`,
      ),
    enabled: Boolean(selectedEntityId),
  });

  const plansQuery = useQuery({
    queryKey: ["treatment-plans", patientId, selectedEntityId],
    queryFn: () =>
      api.get<TreatmentPlanRow[]>(
        `/patients/${patientId}/treatment-plans?entityId=${selectedEntityId}`,
      ),
    enabled: Boolean(selectedEntityId) && Boolean(patientId),
  });

  const summaryMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch(`/visits/${params.id}/clinical`, {
        entityId: selectedEntityId,
        ...payload,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["visit", params.id, selectedEntityId],
      }),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Failed to save"),
  });

  const diagnosisMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post(`/visits/${params.id}/diagnoses`, {
        entityId: selectedEntityId,
        ...payload,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["diagnoses", params.id, selectedEntityId],
      }),
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Failed to record diagnosis",
      ),
  });

  const createPlanMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post(`/patients/${patientId}/treatment-plans`, {
        entityId: selectedEntityId,
        visitId: params.id,
        ...payload,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["treatment-plans", patientId, selectedEntityId],
      }),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Failed to create plan"),
  });

  if (visitQuery.isLoading)
    return <p className="text-muted-foreground">Loading…</p>;
  if (!visitQuery.data)
    return <p className="text-destructive">Visit not found.</p>;
  const visit = visitQuery.data;

  function handleSummarySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    summaryMutation.mutate({
      chiefComplaint: String(form.get("chiefComplaint") ?? "") || undefined,
      clinicalFindings: String(form.get("clinicalFindings") ?? "") || undefined,
      diagnosisSummary: String(form.get("diagnosisSummary") ?? "") || undefined,
      treatmentAdvice: String(form.get("treatmentAdvice") ?? "") || undefined,
    });
  }

  function handleDiagnosisSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const description = String(form.get("description") ?? "").trim();
    if (!description) return;
    diagnosisMutation.mutate({
      description,
      toothNumber: selectedTooth ?? undefined,
    });
    e.currentTarget.reset();
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <h1 className="text-heading-page">{visit.patient?.fullName}</h1>
        <Badge>{visit.visitNumber}</Badge>
        <Badge variant="muted">{formatStatus(visit.status)}</Badge>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Encounter Summary</CardTitle>
          <CardDescription>
            Checked in {formatIstDateTime(visit.checkedInAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canWriteSummary ? (
            <form
              onSubmit={handleSummarySubmit}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="chiefComplaint">Chief complaint</Label>
                <Input
                  id="chiefComplaint"
                  name="chiefComplaint"
                  defaultValue={visit.chiefComplaint ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="clinicalFindings">Clinical findings</Label>
                <textarea
                  id="clinicalFindings"
                  name="clinicalFindings"
                  defaultValue={visit.clinicalFindings ?? ""}
                  className="rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 p-2 text-sm"
                  rows={2}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="diagnosisSummary">Diagnosis summary</Label>
                <textarea
                  id="diagnosisSummary"
                  name="diagnosisSummary"
                  defaultValue={visit.diagnosisSummary ?? ""}
                  className="rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 p-2 text-sm"
                  rows={2}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="treatmentAdvice">Treatment advice</Label>
                <textarea
                  id="treatmentAdvice"
                  name="treatmentAdvice"
                  defaultValue={visit.treatmentAdvice ?? ""}
                  className="rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 p-2 text-sm"
                  rows={2}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={summaryMutation.isPending}
                className="self-start"
              >
                {summaryMutation.isPending ? "Saving…" : "Save summary"}
              </Button>
            </form>
          ) : (
            <dl className="grid gap-2 text-sm">
              <dt className="text-muted-foreground">Chief complaint</dt>
              <dd>{visit.chiefComplaint ?? "—"}</dd>
              <dt className="text-muted-foreground">Findings</dt>
              <dd>{visit.clinicalFindings ?? "—"}</dd>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Odontogram</CardTitle>
          <CardDescription>
            Click a tooth to view or record its condition.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <Odontogram
            entries={chartQuery.data ?? []}
            selectedTooth={selectedTooth}
            onToothClick={(t) =>
              setSelectedTooth(t === selectedTooth ? null : t)
            }
          />
          {selectedTooth && canDiagnose && patientId && (
            <DentalChartEntryForm
              patientId={patientId}
              entityId={selectedEntityId}
              toothNumber={selectedTooth}
              visitId={params.id}
              onSaved={() => setSelectedTooth(null)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnoses</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {diagnosesQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">None recorded yet.</p>
          )}
          {diagnosesQuery.data && diagnosesQuery.data.length > 0 && (
            <div className="divide-y divide-border text-sm">
              {diagnosesQuery.data.map((d) => (
                <div key={d.id} className="py-2 first:pt-0">
                  {d.toothNumber ? `Tooth ${d.toothNumber}: ` : ""}
                  {d.description}
                </div>
              ))}
            </div>
          )}
          {canDiagnose && (
            <form onSubmit={handleDiagnosisSubmit} className="flex gap-2">
              <Input
                name="description"
                placeholder={
                  selectedTooth
                    ? `Diagnosis for tooth ${selectedTooth}…`
                    : "Diagnosis…"
                }
              />
              <Button
                type="submit"
                size="sm"
                disabled={diagnosisMutation.isPending}
              >
                Add
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {plansQuery.data?.map((plan) => (
        <TreatmentPlanCard key={plan.id} plan={plan} patientId={patientId!} />
      ))}
      {canPlan && (plansQuery.data?.length ?? 0) === 0 && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            createPlanMutation.mutate({
              items: [],
            })
          }
          disabled={createPlanMutation.isPending}
        >
          + Start a treatment plan for this visit
        </Button>
      )}

      <ClinicalNotesPanel visitId={params.id} />
      <PrescriptionsPanel visitId={params.id} />
    </div>
  );
}
