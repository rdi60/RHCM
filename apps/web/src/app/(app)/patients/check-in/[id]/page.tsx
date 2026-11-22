"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { AppointmentRow, CrossEntityMatch, PatientRow, PatientSearchResult, TemporaryRegistrationRow } from "@/lib/types";
import { formatIstDateTime } from "@/lib/ist";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus } from "lucide-react";

export default function CheckInPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { selectedEntityId, hasPermission } = useAuth();
  const canCrossEntity = hasPermission(PERMISSIONS.PATIENT_CROSS_ENTITY_LINK);

  const [selectedPatient, setSelectedPatient] = useState<{ id: string; fullName: string; uhid: string; crossEntity: boolean } | null>(
    null,
  );
  const [wantsNew, setWantsNew] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [showCrossEntity, setShowCrossEntity] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const regQuery = useQuery({
    queryKey: ["temp-registration", params.id, selectedEntityId],
    queryFn: () => api.get<TemporaryRegistrationRow>(`/temp-registrations/${params.id}?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const appointmentsQuery = useQuery({
    queryKey: ["appointments-for-temp-reg", selectedEntityId, params.id],
    queryFn: () => api.get<AppointmentRow[]>(`/appointments/for-temp-registration/${params.id}?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const searchTerm = regQuery.data?.phone || regQuery.data?.fullName || "";

  const matchesQuery = useQuery({
    queryKey: ["patient-search", selectedEntityId, searchTerm],
    queryFn: () => api.get<PatientSearchResult>(`/patients/search?entityId=${selectedEntityId}&q=${encodeURIComponent(searchTerm)}`),
    enabled: Boolean(selectedEntityId) && Boolean(searchTerm),
  });

  const crossEntityQuery = useQuery({
    queryKey: ["cross-entity-search", selectedEntityId, searchTerm],
    queryFn: () => api.get<CrossEntityMatch[]>(`/patients/cross-entity-search?entityId=${selectedEntityId}&q=${encodeURIComponent(searchTerm)}`),
    enabled: Boolean(selectedEntityId) && Boolean(searchTerm) && showCrossEntity,
  });

  const checkInMutation = useMutation({
    mutationFn: () =>
      api.post<{ patient: PatientRow }>(`/temp-registrations/${params.id}/check-in`, {
        entityId: selectedEntityId,
        matchedPatientId: wantsNew ? undefined : selectedPatient?.id,
        crossEntityConsentGranted: selectedPatient?.crossEntity ? consentChecked : undefined,
        appointmentId: appointmentId ?? undefined,
      }),
    onSuccess: (res) => router.push(`/patients/${res.patient.id}`),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Check-in failed"),
  });

  useEffect(() => {
    setError(null);
  }, [selectedPatient, wantsNew]);

  if (regQuery.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!regQuery.data) return <p className="text-destructive">Registration not found.</p>;
  const reg = regQuery.data;

  const canConfirm = wantsNew || (selectedPatient && (!selectedPatient.crossEntity || consentChecked));

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Check In</h1>

      <Card>
        <CardHeader>
          <CardTitle>{reg.fullName}</CardTitle>
          <CardDescription>
            {reg.tempId}
            {reg.phone ? ` · ${reg.phone}` : ""}
            {reg.visitReason ? ` · ${reg.visitReason}` : ""}
          </CardDescription>
        </CardHeader>
      </Card>

      {(appointmentsQuery.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scheduled appointment</CardTitle>
            <CardDescription>Confirm which booked appointment this check-in is for, if any.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {appointmentsQuery.data?.map((a) => (
              <button
                key={a.id}
                onClick={() => setAppointmentId(appointmentId === a.id ? null : a.id)}
                className={`flex items-center justify-between rounded-md border p-3 text-left ${appointmentId === a.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
              >
                <div>
                  <p className="font-medium">{formatIstDateTime(a.startAt)}</p>
                  <p className="text-sm text-muted-foreground">
                    {a.doctor?.fullName} {a.resource ? `· ${a.resource.label ?? `${a.resource.type} ${a.resource.number}`}` : ""}
                  </p>
                </div>
                {appointmentId === a.id && <Badge>Selected</Badge>}
              </button>
            ))}
            {!appointmentId && <p className="text-xs text-muted-foreground">No appointment selected — this will be treated as a walk-in.</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Possible existing matches</CardTitle>
          <CardDescription>Already registered at this entity.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {matchesQuery.data?.patients.length === 0 && (
            <p className="text-sm text-muted-foreground">No existing patient matches this name or phone here.</p>
          )}
          {matchesQuery.data?.patients.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedPatient({ id: p.id, fullName: p.fullName, uhid: p.uhid, crossEntity: false });
                setWantsNew(false);
              }}
              className={`flex items-center justify-between rounded-md border p-3 text-left ${selectedPatient?.id === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
            >
              <div>
                <p className="font-medium">{p.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {p.uhid} {p.phone ? `· ${p.phone}` : ""}
                </p>
              </div>
              {selectedPatient?.id === p.id && <Badge>Selected</Badge>}
            </button>
          ))}

          {canCrossEntity && !showCrossEntity && (
            <Button variant="outline" size="sm" className="self-start mt-2" onClick={() => setShowCrossEntity(true)}>
              Search other entities
            </Button>
          )}

          {showCrossEntity && (
            <div className="mt-2 flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Other entities</p>
              {crossEntityQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No matches elsewhere.</p>}
              {crossEntityQuery.data?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPatient({ id: p.id, fullName: p.fullName, uhid: p.uhid, crossEntity: true });
                    setWantsNew(false);
                    setConsentChecked(false);
                  }}
                  className={`flex items-center justify-between rounded-md border p-3 text-left ${selectedPatient?.id === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  <div>
                    <p className="font-medium">{p.fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.uhid} {p.phone ? `· ${p.phone} · ` : ""}
                      Linked to: {p.linkedEntities.join(", ")}
                    </p>
                  </div>
                  {selectedPatient?.id === p.id && <Badge variant="destructive">Cross-entity link</Badge>}
                </button>
              ))}
            </div>
          )}

          {selectedPatient?.crossEntity && (
            <label className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
              <span>
                I have recorded this patient's consent to link their identity across entities (required by privacy policy before
                merging records from a different legal entity).
              </span>
            </label>
          )}

          <Button
            variant={wantsNew ? "default" : "outline"}
            className="self-start mt-2"
            onClick={() => {
              setWantsNew(true);
              setSelectedPatient(null);
            }}
          >
            <UserPlus className="h-4 w-4" />
            This is a new patient — issue a new UHID
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={!canConfirm || checkInMutation.isPending} onClick={() => checkInMutation.mutate()}>
        {checkInMutation.isPending ? "Checking in…" : "Confirm check-in"}
      </Button>
    </div>
  );
}
