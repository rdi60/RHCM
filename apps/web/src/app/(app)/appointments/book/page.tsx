"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import { formatIstTime } from "@/lib/ist";
import type { AppointmentRow, AvailabilityResponse, PatientSearchResult } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DoctorOption {
  id: string;
  fullName: string;
}
interface ResourceOption {
  id: string;
  type: "CHAIR" | "OT";
  number: number;
  label: string | null;
  isActive: boolean;
}

function BookForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedEntityId, hasPermission } = useAuth();
  const canOverride = hasPermission(PERMISSIONS.APPOINTMENT_OVERRIDE_CONFLICT);

  const [date, setDate] = useState(searchParams.get("date") ?? "");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<{ id: string; label: string; isTempReg: boolean } | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [resourceId, setResourceId] = useState(searchParams.get("resourceId") ?? "");
  const [slot, setSlot] = useState<{ startAt: string; endAt: string } | null>(null);
  const [type, setType] = useState("CONSULTATION");
  const [overrideConflict, setOverrideConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchQuery = useQuery({
    queryKey: ["patient-search", selectedEntityId, query],
    queryFn: () => api.get<PatientSearchResult>(`/patients/search?entityId=${selectedEntityId}&q=${encodeURIComponent(query)}`),
    enabled: Boolean(selectedEntityId) && query.length > 1,
  });

  const doctorsQuery = useQuery({
    queryKey: ["doctor-directory", selectedEntityId],
    queryFn: () => api.get<DoctorOption[]>(`/doctors/directory?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const resourcesQuery = useQuery({
    queryKey: ["resources-directory", selectedEntityId],
    queryFn: () => api.get<ResourceOption[]>(`/entities/${selectedEntityId}/resources/directory`),
    enabled: Boolean(selectedEntityId),
  });

  const availabilityQuery = useQuery({
    queryKey: ["availability", selectedEntityId, doctorId, date],
    queryFn: () => api.get<AvailabilityResponse>(`/appointments/availability?entityId=${selectedEntityId}&doctorId=${doctorId}&date=${date}`),
    enabled: Boolean(selectedEntityId) && Boolean(doctorId) && Boolean(date),
  });

  const bookMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        entityId: selectedEntityId,
        doctorId,
        resourceId: resourceId || undefined,
        startAt: slot!.startAt,
        endAt: slot!.endAt,
        type,
      };
      if (subject?.isTempReg) payload.temporaryRegistrationId = subject.id;
      else payload.patientId = subject?.id;
      if (type === "EMERGENCY" && overrideConflict) payload.overrideConflict = true;
      return api.post<AppointmentRow>("/appointments", payload);
    },
    onSuccess: (appt) => router.push(`/appointments/${appt.id}`),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to book"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!subject) return setError("Select a patient or temporary registration.");
    if (!doctorId) return setError("Select a doctor.");
    if (!slot) return setError("Select a time slot.");
    bookMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-heading-page">New Appointment</h1>

      <Card>
        <CardHeader>
          <CardTitle>Patient</CardTitle>
          <CardDescription>Search by name, phone, UHID, or temp ID.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {subject ? (
            <div className="flex items-center justify-between rounded-button border border-primary/40 bg-primary/5 p-2 text-sm">
              {subject.label}
              <Button variant="ghost" size="sm" onClick={() => setSubject(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="flex flex-col gap-1">
                {searchQuery.data?.patients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="rounded-button border border-border p-2 text-left text-sm transition-colors hover:bg-lavender"
                    onClick={() => setSubject({ id: p.id, label: `${p.fullName} (${p.uhid})`, isTempReg: false })}
                  >
                    {p.fullName} · {p.uhid}
                  </button>
                ))}
                {searchQuery.data?.temporaryRegistrations.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="rounded-button border border-border p-2 text-left text-sm transition-colors hover:bg-lavender"
                    onClick={() => setSubject({ id: r.id, label: `${r.fullName} (${r.tempId}, not yet checked in)`, isTempReg: true })}
                  >
                    {r.fullName} · {r.tempId} <span className="text-muted-foreground">(temp registration)</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doctor & time</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doctorId">Doctor</Label>
              <select
                id="doctorId"
                value={doctorId}
                onChange={(e) => {
                  setDoctorId(e.target.value);
                  setSlot(null);
                }}
                className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm"
              >
                <option value="">Select a doctor</option>
                {doctorsQuery.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSlot(null);
                }}
              />
            </div>
          </div>

          {doctorId && date && (
            <div>
              <Label>Available slots (IST)</Label>
              {availabilityQuery.data?.onLeave && <p className="text-sm text-destructive">Doctor is on leave this day.</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {availabilityQuery.data?.slots.map((s) => (
                  <button
                    key={s.startAt}
                    type="button"
                    disabled={!s.available}
                    onClick={() => setSlot({ startAt: s.startAt, endAt: s.endAt })}
                    className={`rounded-button border px-2 py-1 text-xs ${
                      slot?.startAt === s.startAt
                        ? "border-primary bg-primary text-primary-foreground"
                        : s.available
                          ? "border-border transition-colors hover:bg-lavender"
                          : "border-border bg-muted text-muted-foreground line-through"
                    }`}
                  >
                    {formatIstTime(s.startAt)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resourceId">Chair / OT</Label>
              <select
                id="resourceId"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm"
              >
                <option value="">Unassigned</option>
                {resourcesQuery.data
                  ?.filter((r) => r.isActive)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label ?? `${r.type} ${r.number}`}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm"
              >
                <option value="CONSULTATION">Consultation</option>
                <option value="TREATMENT">Treatment</option>
                <option value="FOLLOW_UP">Follow-up</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
          </div>

          {type === "EMERGENCY" && canOverride && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={overrideConflict} onChange={(e) => setOverrideConflict(e.target.checked)} />
              Override this doctor's schedule conflict (emergency — chairs/OTs can never be double-booked)
            </label>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div>
            <Button onClick={handleSubmit} disabled={bookMutation.isPending}>
              {bookMutation.isPending ? "Booking…" : "Book appointment"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BookAppointmentPage() {
  return (
    <Suspense>
      <BookForm />
    </Suspense>
  );
}
