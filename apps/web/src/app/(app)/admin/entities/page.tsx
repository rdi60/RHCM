"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { ClinicResourceRow, EntitySettings } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function EntitySettingsPage() {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const canManageSettings = hasPermission(PERMISSIONS.ENTITY_SETTINGS_MANAGE);
  const canManageResources = hasPermission(PERMISSIONS.RESOURCE_MANAGE);

  const settingsQuery = useQuery({
    queryKey: ["entity-settings", selectedEntityId],
    queryFn: () => api.get<EntitySettings>(`/entities/${selectedEntityId}/settings`),
    enabled: Boolean(selectedEntityId) && canManageSettings,
  });

  const resourcesQuery = useQuery({
    queryKey: ["entity-resources", selectedEntityId],
    queryFn: () => api.get<ClinicResourceRow[]>(`/entities/${selectedEntityId}/resources`),
    enabled: Boolean(selectedEntityId) && canManageResources,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<EntitySettings>) => api.patch(`/entities/${selectedEntityId}/settings`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-settings", selectedEntityId] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to save"),
  });

  if (!canManageSettings && !canManageResources) {
    return <p className="text-muted-foreground">You do not have access to entity settings for this entity.</p>;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    updateMutation.mutate({
      invoicePrefix: String(form.get("invoicePrefix") ?? ""),
      receiptPrefix: String(form.get("receiptPrefix") ?? ""),
      estimatePrefix: String(form.get("estimatePrefix") ?? ""),
      gstin: String(form.get("gstin") ?? "") || null,
    } as Partial<EntitySettings>);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Entity Settings</h1>

      {canManageSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Document numbering & tax</CardTitle>
            <CardDescription>Used once estimates/invoices/receipts are enabled in a later stage.</CardDescription>
          </CardHeader>
          <CardContent>
            {settingsQuery.isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : settingsQuery.data ? (
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invoicePrefix">Invoice prefix</Label>
                  <Input id="invoicePrefix" name="invoicePrefix" defaultValue={settingsQuery.data.invoicePrefix} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="receiptPrefix">Receipt prefix</Label>
                  <Input id="receiptPrefix" name="receiptPrefix" defaultValue={settingsQuery.data.receiptPrefix} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="estimatePrefix">Estimate prefix</Label>
                  <Input id="estimatePrefix" name="estimatePrefix" defaultValue={settingsQuery.data.estimatePrefix} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input id="gstin" name="gstin" defaultValue={settingsQuery.data.gstin ?? ""} />
                </div>
                {error && <p className="col-span-full text-sm text-destructive">{error}</p>}
                <div className="col-span-full">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
      )}

      {canManageResources && (
        <Card>
          <CardHeader>
            <CardTitle>Chairs & Operation Theaters</CardTitle>
            <CardDescription>Bookable resources for this entity.</CardDescription>
          </CardHeader>
          <CardContent>
            {resourcesQuery.isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {resourcesQuery.data?.map((r) => (
                  <Badge key={r.id} variant={r.isActive ? "default" : "muted"}>
                    {r.label ?? `${r.type} ${r.number}`}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
