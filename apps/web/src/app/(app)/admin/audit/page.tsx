"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { AuditLogRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AuditPage() {
  const { selectedEntityId, hasPermission } = useAuth();
  const canRead = hasPermission(PERMISSIONS.AUDIT_LOG_READ);

  const auditQuery = useQuery({
    queryKey: ["audit-logs", selectedEntityId],
    queryFn: () => api.get<AuditLogRow[]>(`/audit-logs?entityId=${selectedEntityId}`),
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
          <CardDescription>Most recent 100 events for this entity.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2">When</th>
                <th>Action</th>
                <th>Resource</th>
              </tr>
            </thead>
            <tbody>
              {auditQuery.data?.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="py-2 whitespace-nowrap">
                    {new Date(row.occurredAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                  <td>{row.action}</td>
                  <td>
                    {row.resourceType}
                    {row.resourceId ? ` · ${row.resourceId.slice(0, 8)}…` : ""}
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
