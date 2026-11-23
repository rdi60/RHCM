"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import { formatIstDateTime } from "@/lib/ist";
import type { PrescriptionItem, PrescriptionRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BLANK_ITEM: PrescriptionItem = { drugName: "", dosage: "", frequency: "", durationDays: 3, instructions: "" };

export function PrescriptionsPanel({ visitId }: { visitId: string }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<PrescriptionItem[]>([{ ...BLANK_ITEM }]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canPrescribe = hasPermission(PERMISSIONS.CLINICAL_PRESCRIBE);

  const prescriptionsQuery = useQuery({
    queryKey: ["prescriptions", visitId, selectedEntityId],
    queryFn: () => api.get<PrescriptionRow[]>(`/visits/${visitId}/prescriptions?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/visits/${visitId}/prescriptions`, {
        entityId: selectedEntityId,
        items: items.filter((i) => i.drugName.trim()),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      setItems([{ ...BLANK_ITEM }]);
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["prescriptions", visitId, selectedEntityId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to save prescription"),
  });

  function updateItem(idx: number, patch: Partial<PrescriptionItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function handleSubmit() {
    setError(null);
    if (!items.some((i) => i.drugName.trim())) return setError("Add at least one drug.");
    createMutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prescriptions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {prescriptionsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">None issued for this visit.</p>}
        {prescriptionsQuery.data?.map((rx) => (
          <div key={rx.id} className="rounded-button border border-border p-3 text-sm">
            <p className="text-xs text-muted-foreground">{formatIstDateTime(rx.prescribedAt)}</p>
            <ul className="mt-1 list-disc pl-4">
              {rx.itemsJson.map((item, i) => (
                <li key={i}>
                  {item.drugName} — {item.dosage}, {item.frequency}, {item.durationDays} days
                  {item.instructions ? ` (${item.instructions})` : ""}
                </li>
              ))}
            </ul>
            {rx.notes && <p className="mt-1 text-muted-foreground">{rx.notes}</p>}
          </div>
        ))}

        {canPrescribe && (
          <div className="flex flex-col gap-2 rounded-button border border-dashed border-border p-3">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input placeholder="Drug" value={item.drugName} onChange={(e) => updateItem(idx, { drugName: e.target.value })} />
                <Input placeholder="Dosage" value={item.dosage} onChange={(e) => updateItem(idx, { dosage: e.target.value })} />
                <Input placeholder="Frequency" value={item.frequency} onChange={(e) => updateItem(idx, { frequency: e.target.value })} />
                <Input
                  type="number"
                  min={1}
                  placeholder="Days"
                  value={item.durationDays}
                  onChange={(e) => updateItem(idx, { durationDays: Number(e.target.value) })}
                />
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setItems((prev) => [...prev, { ...BLANK_ITEM }])}>
              + Add drug
            </Button>
            <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending} className="self-start">
              {createMutation.isPending ? "Saving…" : "Issue prescription"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
