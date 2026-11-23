"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { ConsentRecordRow, ConsentType } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIstDateTime } from "@/lib/ist";

const CONSENT_TYPES: ConsentType[] = ["TREATMENT", "PHOTO_VIDEO", "DATA_SHARING", "MARKETING", "CROSS_ENTITY_IDENTITY_LINKING"];

export function ConsentSection({ patientId }: { patientId: string }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const canManage = hasPermission(PERMISSIONS.PATIENT_CONSENT_MANAGE);

  const queryKey = ["consents", patientId, selectedEntityId];
  const consentsQuery = useQuery({
    queryKey,
    queryFn: () => api.get<ConsentRecordRow[]>(`/patients/${patientId}/consents?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { consentType: ConsentType; granted: boolean; documentRef?: string }) =>
      api.post(`/patients/${patientId}/consents`, { entityId: selectedEntityId, ...payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setShowForm(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to record consent"),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      consentType: String(form.get("consentType")) as ConsentType,
      granted: form.get("granted") === "on",
      documentRef: String(form.get("documentRef") ?? "") || undefined,
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Consent Records</CardTitle>
          <CardDescription>Append-only — capturing a new consent of the same type never overwrites what's on record, it adds a new version.</CardDescription>
        </div>
        {canManage && !showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            + Record consent
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {showForm && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-button border border-dashed border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="consentType">Type</Label>
                <select id="consentType" name="consentType" required className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm">
                  {CONSENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="documentRef">Linked document ID (optional)</Label>
                <Input id="documentRef" name="documentRef" placeholder="e.g. a signed form uploaded in Documents" />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="granted" defaultChecked />
                Consent granted (uncheck to record a refusal/withdrawal)
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {consentsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No consent records yet.</p>}

        {consentsQuery.data?.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-button border border-border p-3 text-sm">
            <div>
              <p className="font-medium">
                {c.consentType.replace(/_/g, " ")} <span className="font-normal text-muted-foreground">v{c.version}</span>
              </p>
              <p className="text-muted-foreground">
                {formatIstDateTime(c.grantedAt)} {c.capturedBy ? `· ${c.capturedBy.email}` : ""} {c.documentRef ? `· doc ${c.documentRef}` : ""}
              </p>
            </div>
            <Badge variant={c.granted ? "success" : "destructive"}>{c.granted ? "Granted" : "Refused/withdrawn"}</Badge>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
