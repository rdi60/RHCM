"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toIstDateParam, todayIstDateParam, formatIstTime } from "@/lib/ist";
import type { AppointmentRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ViewTabs } from "./view-tabs";

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 20;
const PX_PER_MINUTE = 1.2;

const STATUS_COLORS: Record<string, string> = {
  BOOKED: "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300",
  CONFIRMED: "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300",
  ARRIVED: "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300",
  CHECKED_IN: "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300",
  WAITING: "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300",
  IN_TREATMENT: "bg-violet-500/15 border-violet-500/40 text-violet-700 dark:text-violet-300",
  COMPLETED: "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  CANCELLED: "bg-muted border-border text-muted-foreground line-through",
  NO_SHOW: "bg-destructive/10 border-destructive/40 text-destructive",
  RESCHEDULED: "bg-muted border-border text-muted-foreground line-through",
};

interface ResourceRow {
  id: string;
  type: "CHAIR" | "OT";
  number: number;
  label: string | null;
  isActive: boolean;
}

function DayView() {
  const { selectedEntityId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? todayIstDateParam());

  const resourcesQuery = useQuery({
    queryKey: ["resources-directory", selectedEntityId],
    queryFn: () => api.get<ResourceRow[]>(`/entities/${selectedEntityId}/resources/directory`),
    enabled: Boolean(selectedEntityId),
  });

  const { from, to } = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    const dayStartUtc = new Date(Date.UTC(y, m - 1, d, 0, 0) - (5 * 60 + 30) * 60 * 1000);
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
    return { from: dayStartUtc.toISOString(), to: dayEndUtc.toISOString() };
  }, [date]);

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", selectedEntityId, from, to],
    queryFn: () => api.get<AppointmentRow[]>(`/appointments?entityId=${selectedEntityId}&from=${from}&to=${to}`),
    enabled: Boolean(selectedEntityId),
  });

  const resources = (resourcesQuery.data ?? []).filter((r) => r.isActive);
  const gridMinutes = (GRID_END_HOUR - GRID_START_HOUR) * 60;
  const gridHeight = gridMinutes * PX_PER_MINUTE;

  function minutesFromGridStart(iso: string): number {
    const t = new Date(iso);
    const istHour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(t),
    );
    const istMinute = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", minute: "2-digit" }).format(t));
    return (istHour - GRID_START_HOUR) * 60 + istMinute;
  }

  function shiftDate(deltaDays: number) {
    const [y, m, d] = date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
    setDate(toIstDateParam(next));
  }

  function bookAt(resourceId: string, hour: number) {
    const params = new URLSearchParams({ date, resourceId, hour: String(hour) });
    router.push(`/appointments/book?${params.toString()}`);
  }

  const hourMarks = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <Link href="/appointments/book">
          <Button>
            <Plus className="h-4 w-4" />
            New appointment
          </Button>
        </Link>
      </div>

      <ViewTabs />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => shiftDate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <Button variant="outline" size="sm" onClick={() => shiftDate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDate(todayIstDateParam())}>
          Today
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {resources.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No chairs or OTs configured for this entity.</p>
          ) : (
            <div className="flex" style={{ minWidth: resources.length * 160 + 64 }}>
              {/* Time gutter */}
              <div className="shrink-0" style={{ width: 56 }}>
                <div className="h-10 border-b border-border" />
                <div className="relative" style={{ height: gridHeight }}>
                  {hourMarks.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-border/60 text-right pr-1 text-xs text-muted-foreground"
                      style={{ top: (h - GRID_START_HOUR) * 60 * PX_PER_MINUTE }}
                    >
                      {String(h).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
              </div>

              {resources.map((resource) => {
                const resAppts = (appointmentsQuery.data ?? []).filter((a) => a.resourceId === resource.id);
                return (
                  <div key={resource.id} className="shrink-0 border-l border-border" style={{ width: 160 }}>
                    <div className="flex h-10 items-center justify-center border-b border-border text-sm font-medium">
                      {resource.label ?? `${resource.type} ${resource.number}`}
                    </div>
                    <div className="relative" style={{ height: gridHeight }}>
                      {hourMarks.map((h) => (
                        <button
                          key={h}
                          className="absolute left-0 right-0 border-t border-border/40 hover:bg-primary/5"
                          style={{ top: (h - GRID_START_HOUR) * 60 * PX_PER_MINUTE, height: 60 * PX_PER_MINUTE }}
                          onClick={() => bookAt(resource.id, h)}
                          aria-label={`Book ${resource.label ?? resource.type} at ${h}:00`}
                        />
                      ))}
                      {resAppts.map((appt) => {
                        const top = minutesFromGridStart(appt.startAt) * PX_PER_MINUTE;
                        const height = Math.max(
                          minutesFromGridStart(appt.endAt) * PX_PER_MINUTE - top,
                          18,
                        );
                        return (
                          <button
                            key={appt.id}
                            onClick={() => router.push(`/appointments/${appt.id}`)}
                            className={`absolute left-0.5 right-0.5 overflow-hidden rounded border px-1 py-0.5 text-left text-[11px] leading-tight ${STATUS_COLORS[appt.status] ?? ""}`}
                            style={{ top, height }}
                          >
                            <div className="font-medium truncate">
                              {appt.patient?.fullName ?? appt.temporaryRegistration?.fullName ?? "Patient"}
                            </div>
                            <div className="truncate">
                              {formatIstTime(appt.startAt)} · {appt.type}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AppointmentsDayPage() {
  return (
    <Suspense>
      <DayView />
    </Suspense>
  );
}
