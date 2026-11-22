"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toIstDateParam, todayIstDateParam } from "@/lib/ist";
import type { AppointmentRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ViewTabs } from "../view-tabs";

interface DoctorOption {
  id: string;
  fullName: string;
}

function startOfIstWeek(dateParam: string): Date {
  const [y, m, d] = dateParam.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const weekday = utcMidnight.getUTCDay(); // 0=Sun
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - weekday);
  return utcMidnight;
}

export default function AppointmentsWeekPage() {
  const { selectedEntityId } = useAuth();
  const [anchor, setAnchor] = useState(todayIstDateParam());

  const weekStart = startOfIstWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    return toIstDateParam(d);
  });

  const { from, to } = useMemo(() => {
    const [y, m, d] = days[0].split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d) - (5 * 60 + 30) * 60 * 1000);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]]);

  const doctorsQuery = useQuery({
    queryKey: ["doctor-directory", selectedEntityId],
    queryFn: () => api.get<DoctorOption[]>(`/doctors/directory?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", selectedEntityId, from, to],
    queryFn: () => api.get<AppointmentRow[]>(`/appointments?entityId=${selectedEntityId}&from=${from}&to=${to}`),
    enabled: Boolean(selectedEntityId),
  });

  function countFor(doctorId: string, dateParam: string): number {
    return (appointmentsQuery.data ?? []).filter((a) => {
      if (a.doctorId !== doctorId) return false;
      const istDate = toIstDateParam(new Date(a.startAt));
      return istDate === dateParam;
    }).length;
  }

  function shiftWeek(deltaWeeks: number) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
    setAnchor(toIstDateParam(d));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Appointments</h1>
      <ViewTabs />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => shiftWeek(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {days[0]} – {days[6]}
        </span>
        <Button variant="outline" size="sm" onClick={() => shiftWeek(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-2 text-left text-muted-foreground">Doctor</th>
                {days.map((d) => (
                  <th key={d} className="p-2 text-center text-muted-foreground">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doctorsQuery.data?.map((doc) => (
                <tr key={doc.id} className="border-b border-border last:border-0">
                  <td className="p-2 font-medium">{doc.fullName}</td>
                  {days.map((d) => {
                    const count = countFor(doc.id, d);
                    return (
                      <td key={d} className="p-2 text-center">
                        {count > 0 ? (
                          <Link href={`/appointments?date=${d}`} className="inline-block rounded-md bg-primary/10 px-2 py-1 text-primary hover:bg-primary/20">
                            {count}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
