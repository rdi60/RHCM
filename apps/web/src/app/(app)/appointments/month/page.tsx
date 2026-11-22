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
import { cn } from "@/lib/utils";
import { ViewTabs } from "../view-tabs";

export default function AppointmentsMonthPage() {
  const { selectedEntityId } = useAuth();
  const today = todayIstDateParam();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7))); // 1-12

  const { from, to, cells } = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const startWeekday = firstOfMonth.getUTCDay();
    const gridStart = new Date(firstOfMonth);
    gridStart.setUTCDate(gridStart.getUTCDate() - startWeekday);

    const cells: { dateParam: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setUTCDate(d.getUTCDate() + i);
      cells.push({ dateParam: toIstDateParam(d), inMonth: d.getUTCMonth() === month - 1 });
    }

    const fromUtc = new Date(Date.UTC(year, month - 1, 1) - (5 * 60 + 30) * 60 * 1000);
    const toUtc = new Date(Date.UTC(year, month, 1) - (5 * 60 + 30) * 60 * 1000);
    return { from: fromUtc.toISOString(), to: toUtc.toISOString(), cells };
  }, [year, month]);

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", selectedEntityId, from, to],
    queryFn: () => api.get<AppointmentRow[]>(`/appointments?entityId=${selectedEntityId}&from=${from}&to=${to}`),
    enabled: Boolean(selectedEntityId),
  });

  const countsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const appt of appointmentsQuery.data ?? []) {
      const key = toIstDateParam(new Date(appt.startAt));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [appointmentsQuery.data]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Appointments</h1>
      <ViewTabs />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <Button variant="outline" size="sm" onClick={() => shiftMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-2">
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="p-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const count = countsByDate.get(cell.dateParam) ?? 0;
              return (
                <Link
                  key={cell.dateParam}
                  href={`/appointments?date=${cell.dateParam}`}
                  className={cn(
                    "flex h-20 flex-col rounded-md border border-border p-1.5 text-xs hover:bg-muted",
                    !cell.inMonth && "opacity-40",
                    cell.dateParam === todayIstDateParam() && "border-primary",
                  )}
                >
                  <span>{Number(cell.dateParam.slice(8, 10))}</span>
                  {count > 0 && <span className="mt-auto self-start rounded bg-primary/10 px-1 text-primary">{count}</span>}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
