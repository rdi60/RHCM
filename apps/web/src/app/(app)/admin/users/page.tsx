"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { RoleRow, UserAccessRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function UsersPage() {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ email: string; setPasswordToken: string } | null>(null);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");

  const canManageUsers = hasPermission(PERMISSIONS.USER_MANAGE);

  const rolesQuery = useQuery({
    queryKey: ["roles", selectedEntityId],
    queryFn: () => api.get<RoleRow[]>(`/roles?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId) && canManageUsers,
  });

  const usersQuery = useQuery({
    queryKey: ["entity-users", selectedEntityId],
    queryFn: () => api.get<UserAccessRow[]>(`/users?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId) && canManageUsers,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const user = await api.post<{ id: string; email: string; setPasswordToken: string }>("/users", { email });
      await api.post(`/users/${user.id}/access`, { entityId: selectedEntityId, roleId });
      return user;
    },
    onSuccess: (user) => {
      setInviteResult({ email: user.email, setPasswordToken: user.setPasswordToken });
      setEmail("");
      setRoleId("");
      queryClient.invalidateQueries({ queryKey: ["entity-users", selectedEntityId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to invite user"),
  });

  const revokeMutation = useMutation({
    mutationFn: (accessId: string) => api.delete(`/users/access/${accessId}?entityId=${selectedEntityId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-users", selectedEntityId] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to revoke access"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: "ACTIVE" | "DISABLED" }) =>
      api.patch(`/users/${userId}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-users", selectedEntityId] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to update status"),
  });

  if (!canManageUsers) {
    return <p className="text-muted-foreground">You do not have access to user management for this entity.</p>;
  }

  function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteResult(null);
    inviteMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading-page">Users</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Invite a user</CardTitle>
          <CardDescription>Creates an account with no password set, and grants it a role at this entity.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inviteEmail">Email</Label>
              <Input id="inviteEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inviteRole">Role</Label>
              <select
                id="inviteRole"
                required
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm"
              >
                <option value="" disabled>
                  Select a role
                </option>
                {rolesQuery.data?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? "Inviting…" : "Invite"}
            </Button>
          </form>
          {inviteResult && (
            <div className="mt-4 rounded-button border border-border bg-muted/50 p-3 text-sm">
              <p className="font-medium">Account created for {inviteResult.email}.</p>
              <p className="text-muted-foreground">
                Dev-only: share this set-password link (Stage 6 wires this to email automatically):
              </p>
              <code className="break-all">{`/set-password?token=${inviteResult.setPasswordToken}`}</code>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users at this entity</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2">Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>MFA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data?.map((row) => (
                <tr key={row.accessId} className="border-b border-border last:border-0">
                  <td className="py-2">{row.email}</td>
                  <td>{row.roleName}</td>
                  <td>
                    <Badge variant={row.status === "ACTIVE" ? "success" : "muted"}>{row.status}</Badge>
                  </td>
                  <td>{row.mfaEnabled ? <Badge>Enabled</Badge> : <Badge variant="muted">Off</Badge>}</td>
                  <td className="flex gap-2 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMutation.mutate({ userId: row.userId, status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })}
                    >
                      {row.status === "ACTIVE" ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => revokeMutation.mutate(row.accessId)}>
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
