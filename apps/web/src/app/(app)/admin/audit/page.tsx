"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { AuditLogRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIstDateTime } from "@/lib/ist";

export default function AuditPage() {
  const { selectedEntityId, hasPermission } = useAuth();
  const canRead = hasPermission(PERMISSIONS.AUDIT_LOG_READ);
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const params = new URLSearchParams({ entityId: selectedEntityId ?? "" });
  if (action) params.set("action", action);
  if (resourceType) params.set("resourceType", resourceType);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const auditQuery = useQuery({
    queryKey: ["audit-logs", selectedEntityId, action, resourceType, from, to],
    queryFn: () => api.get<AuditLogRow[]>(`/audit-logs?${params.toString()}`),
    enabled: Boolean(selectedEntityId) && canRead,
  });

  if (!canRead) {
    return <p className="text-muted-foreground">You do not have access to the audit log for this entity.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Audit Log</h1>
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Most recent 100 matching events for this entity. Click a row to see the before/after detail.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="action">Action contains</Label>
              <Input id="action" placeholder="e.g. invoice" value={action} onChange={(e) => setAction(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resourceType">Resource type</Label>
              <Input
                id="resourceType"
                placeholder="e.g. patient_document"
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                className="h-9 w-44"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Resource</th>
                </tr>
              </thead>
              <tbody>
                {auditQuery.data?.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    >
                      <td className="py-2 whitespace-nowrap">{formatIstDateTime(row.occurredAt)}</td>
                      <td className="whitespace-nowrap">{row.actor?.email ?? "—"}</td>
                      <td>{row.action}</td>
                      <td>
                        {row.resourceType}
                        {row.resourceId ? ` · ${row.resourceId.slice(0, 8)}…` : ""}
                      </td>
                    </tr>
                    {expandedId === row.id && (row.beforeJson != null || row.afterJson != null) && (
                      <tr className="border-b border-border last:border-0 bg-muted/30">
                        <td colSpan={4} className="py-2">
                          <div className="grid gap-3 sm:grid-cols-2">
                            {row.beforeJson != null && (
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
                                <pre className="overflow-x-auto rounded-md bg-background p-2 text-xs">{JSON.stringify(row.beforeJson, null, 2)}</pre>
                              </div>
                            )}
                            {row.afterJson != null && (
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">After</p>
                                <pre className="overflow-x-auto rounded-md bg-background p-2 text-xs">{JSON.stringify(row.afterJson, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {auditQuery.data?.length === 0 && <p className="py-4 text-sm text-muted-foreground">No matching events.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
