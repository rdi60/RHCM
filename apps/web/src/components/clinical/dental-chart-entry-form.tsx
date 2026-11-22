"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SUGGESTED_CONDITIONS = ["Healthy", "Caries", "Filled", "Crown", "Missing", "Root Canal Treated", "Fractured", "Impacted"];

export function DentalChartEntryForm({
  patientId,
  entityId,
  toothNumber,
  visitId,
  onSaved,
}: {
  patientId: string;
  entityId: string | null;
  toothNumber: number;
  visitId?: string;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(`/patients/${patientId}/dental-chart`, { entityId, visitId, ...payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dental-chart", patientId, entityId] });
      onSaved?.();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to save"),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const condition = String(form.get("condition") ?? "").trim();
    if (!condition) return setError("Condition is required.");
    mutation.mutate({
      toothNumber,
      condition,
      surface: String(form.get("surface") ?? "") || undefined,
      status: String(form.get("status") ?? "") || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Tooth {toothNumber}</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="condition">Condition</Label>
        <Input id="condition" name="condition" list="condition-suggestions" required autoFocus />
        <datalist id="condition-suggestions">
          {SUGGESTED_CONDITIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="surface">Surface</Label>
          <Input id="surface" name="surface" placeholder="M, O, D, B, L" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <Input id="status" name="status" placeholder="active, resolved…" />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Record"}
      </Button>
    </form>
  );
}
