"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { todayIstDateParam } from "@/lib/ist";
import { formatIstDateTime } from "@/lib/ist";
import type { AppointmentRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ViewTabs } from "../view-tabs";

interface DoctorOption {
  id: string;
  fullName: string;
}

export default function AppointmentsDoctorPage() {
  const { selectedEntityId } = useAuth();
  const [doctorId, setDoctorId] = useState("");

  const doctorsQuery = useQuery({
    queryKey: ["doctor-directory", selectedEntityId],
    queryFn: () => api.get<DoctorOption[]>(`/doctors/directory?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const { from, to } = useMemo(() => {
    const today = todayIstDateParam();
    const [y, m, d] = today.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d) - (5 * 60 + 30) * 60 * 1000);
    const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", selectedEntityId, doctorId, from, to],
    queryFn: () => api.get<AppointmentRow[]>(`/appointments?entityId=${selectedEntityId}&doctorId=${doctorId}&from=${from}&to=${to}`),
    enabled: Boolean(selectedEntityId) && Boolean(doctorId),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Appointments</h1>
      <ViewTabs />

      <select
        value={doctorId}
        onChange={(e) => setDoctorId(e.target.value)}
        className="h-10 w-64 rounded-md border border-border bg-background px-3 text-sm"
      >
        <option value="">Select a doctor</option>
        {doctorsQuery.data?.map((d) => (
          <option key={d.id} value={d.id}>
            {d.fullName}
          </option>
        ))}
      </select>

      <Card>
        <CardHeader>
          <CardTitle>Next 14 days</CardTitle>
          <CardDescription>All upcoming appointments for the selected doctor, across chairs and OTs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!doctorId && <p className="text-sm text-muted-foreground">Select a doctor to see their schedule.</p>}
          {doctorId && appointmentsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No appointments in this window.</p>}
          {appointmentsQuery.data?.map((a) => (
            <Link key={a.id} href={`/appointments/${a.id}`} className="flex items-center justify-between rounded-md border border-border p-2 text-sm hover:bg-muted">
              <div>
                <p className="font-medium">{a.patient?.fullName ?? a.temporaryRegistration?.fullName}</p>
                <p className="text-muted-foreground">
                  {formatIstDateTime(a.startAt)} {a.resource ? `· ${a.resource.label ?? `${a.resource.type} ${a.resource.number}`}` : ""}
                </p>
              </div>
              <Badge variant="muted">{a.status}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
