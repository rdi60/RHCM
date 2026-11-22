"use client";

import { cn } from "@/lib/utils";
import type { DentalChartEntryRow } from "@/lib/types";

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

const CONDITION_COLORS: Record<string, string> = {
  healthy: "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  caries: "bg-destructive/15 border-destructive/40 text-destructive",
  filled: "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300",
  crown: "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300",
  missing: "bg-muted border-border text-muted-foreground",
  "root canal treated": "bg-violet-500/15 border-violet-500/40 text-violet-700 dark:text-violet-300",
};

function latestConditionByTooth(entries: DentalChartEntryRow[]): Map<number, DentalChartEntryRow> {
  const map = new Map<number, DentalChartEntryRow>();
  for (const entry of entries) {
    const existing = map.get(entry.toothNumber);
    if (!existing || new Date(entry.recordedAt) > new Date(existing.recordedAt)) {
      map.set(entry.toothNumber, entry);
    }
  }
  return map;
}

function Tooth({
  number,
  entry,
  selected,
  onClick,
}: {
  number: number;
  entry?: DentalChartEntryRow;
  selected: boolean;
  onClick: () => void;
}) {
  const colorClass = entry ? CONDITION_COLORS[entry.condition.toLowerCase()] ?? "bg-muted border-border" : "border-border hover:bg-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      title={entry ? `${number}: ${entry.condition}` : String(number)}
      className={cn(
        "flex h-12 w-10 flex-col items-center justify-center rounded border text-xs font-medium",
        colorClass,
        selected && "ring-2 ring-primary",
      )}
    >
      <span>{number}</span>
    </button>
  );
}

export function Odontogram({
  entries,
  selectedTooth,
  onToothClick,
}: {
  entries: DentalChartEntryRow[];
  selectedTooth?: number | null;
  onToothClick: (tooth: number) => void;
}) {
  const latest = latestConditionByTooth(entries);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-4">
        <div className="flex gap-0.5">
          {UPPER_RIGHT.map((t) => (
            <Tooth key={t} number={t} entry={latest.get(t)} selected={selectedTooth === t} onClick={() => onToothClick(t)} />
          ))}
        </div>
        <div className="flex gap-0.5">
          {UPPER_LEFT.map((t) => (
            <Tooth key={t} number={t} entry={latest.get(t)} selected={selectedTooth === t} onClick={() => onToothClick(t)} />
          ))}
        </div>
      </div>
      <div className="flex gap-4">
        <div className="flex gap-0.5">
          {LOWER_RIGHT.map((t) => (
            <Tooth key={t} number={t} entry={latest.get(t)} selected={selectedTooth === t} onClick={() => onToothClick(t)} />
          ))}
        </div>
        <div className="flex gap-0.5">
          {LOWER_LEFT.map((t) => (
            <Tooth key={t} number={t} entry={latest.get(t)} selected={selectedTooth === t} onClick={() => onToothClick(t)} />
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
        {Object.entries(CONDITION_COLORS).map(([label, cls]) => (
          <span key={label} className={cn("rounded border px-1.5 py-0.5 capitalize", cls)}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
