"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { PermissionCatalogEntry, RoleRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function RolesPage() {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Set<string>>(new Set());
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<Set<string>>(new Set());

  const canManageRoles = hasPermission(PERMISSIONS.ROLE_MANAGE);

  const catalogQuery = useQuery({
    queryKey: ["permission-catalog"],
    queryFn: () => api.get<PermissionCatalogEntry[]>("/roles/permission-catalog"),
  });

  const rolesQuery = useQuery({
    queryKey: ["roles", selectedEntityId],
    queryFn: () => api.get<RoleRow[]>(`/roles?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId) && canManageRoles,
  });

  const catalogByCategory = useMemo(() => {
    const map = new Map<string, PermissionCatalogEntry[]>();
    for (const entry of catalogQuery.data ?? []) {
      if (!map.has(entry.category)) map.set(entry.category, []);
      map.get(entry.category)!.push(entry);
    }
    return map;
  }, [catalogQuery.data]);

  const createRoleMutation = useMutation({
    mutationFn: () =>
      api.post<RoleRow>("/roles", {
        entityId: selectedEntityId,
        name: newRoleName,
        permissionCodes: Array.from(newRolePermissions),
      }),
    onSuccess: () => {
      setNewRoleName("");
      setNewRolePermissions(new Set());
      queryClient.invalidateQueries({ queryKey: ["roles", selectedEntityId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create role"),
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: (roleId: string) =>
      api.patch(`/roles/${roleId}/permissions`, { entityId: selectedEntityId, permissionCodes: Array.from(draftPermissions) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roles", selectedEntityId] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to update role"),
  });

  function selectRole(role: RoleRow) {
    setSelectedRoleId(role.id);
    setDraftPermissions(new Set(role.permissions));
  }

  function togglePermission(set: Set<string>, setter: (s: Set<string>) => void, code: string) {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setter(next);
  }

  if (!canManageRoles) {
    return <p className="text-muted-foreground">You do not have access to role management for this entity.</p>;
  }

  const selectedRole = rolesQuery.data?.find((r) => r.id === selectedRoleId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading-page">Roles & Permissions</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Roles in this entity</CardTitle>
            <CardDescription>System role templates plus any custom roles.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {rolesQuery.data?.map((role) => (
              <button
                key={role.id}
                onClick={() => selectRole(role)}
                className={`flex items-center justify-between rounded-button border p-3 text-left transition-colors hover:bg-lavender ${selectedRoleId === role.id ? "border-primary/30 bg-lavender" : "border-border"}`}
              >
                <div>
                  <p className="font-medium">{role.name}</p>
                  <p className="text-sm text-muted-foreground">{role.permissions.length} permissions</p>
                </div>
                <Badge variant={role.isSystem ? "muted" : "default"}>{role.isSystem ? "System" : "Custom"}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedRole ? `Edit: ${selectedRole.name}` : "Select a role"}</CardTitle>
            <CardDescription>
              {selectedRole?.isSystem ? "System role templates cannot be edited." : "Toggle permissions for this custom role."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedRole && !selectedRole.isSystem && (
              <>
                <PermissionPicker
                  catalogByCategory={catalogByCategory}
                  selected={draftPermissions}
                  onToggle={(code) => togglePermission(draftPermissions, setDraftPermissions, code)}
                />
                <Button className="mt-4" onClick={() => updatePermissionsMutation.mutate(selectedRole.id)} disabled={updatePermissionsMutation.isPending}>
                  {updatePermissionsMutation.isPending ? "Saving…" : "Save permissions"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create a custom role</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              createRoleMutation.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5 sm:max-w-sm">
              <Label htmlFor="newRoleName">Role name</Label>
              <Input id="newRoleName" required value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
            </div>
            <PermissionPicker
              catalogByCategory={catalogByCategory}
              selected={newRolePermissions}
              onToggle={(code) => togglePermission(newRolePermissions, setNewRolePermissions, code)}
            />
            <div>
              <Button type="submit" disabled={createRoleMutation.isPending || !newRoleName}>
                {createRoleMutation.isPending ? "Creating…" : "Create role"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PermissionPicker({
  catalogByCategory,
  selected,
  onToggle,
}: {
  catalogByCategory: Map<string, PermissionCatalogEntry[]>;
  selected: Set<string>;
  onToggle: (code: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from(catalogByCategory.entries()).map(([category, entries]) => (
        <div key={category}>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{category}</p>
          <div className="flex flex-col gap-1">
            {entries.map((entry) => (
              <label key={entry.code} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.has(entry.code)} onChange={() => onToggle(entry.code)} />
                {entry.description}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
