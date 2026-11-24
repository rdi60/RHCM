"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { user, currentGrant } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-heading-page">Welcome{user ? `, ${user.email}` : ""}</h1>
        <p className="text-body text-muted-foreground">
          Signed in to <span className="font-medium text-foreground">{currentGrant?.entityCode}</span> as{" "}
          <span className="font-medium text-foreground">{currentGrant?.roleName}</span>.
        </p>
      </div>

      <Card surface="lavender">
        <CardHeader>
          <CardTitle>Your access</CardTitle>
          <CardDescription>Entities and roles granted to your account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {user?.access.map((grant) => (
            <div
              key={`${grant.entityId}-${grant.roleId}`}
              className="flex items-center justify-between rounded-button border border-primary/10 bg-card p-3"
            >
              <div>
                <p className="font-medium">{grant.entityCode}</p>
                <p className="text-body text-muted-foreground">{grant.roleName}</p>
              </div>
              <Badge>{grant.permissions.length} permissions</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card surface="peach">
        <CardHeader>
          <CardTitle>Stage 1 of 6</CardTitle>
          <CardDescription>
            Database architecture, entity management, authentication, roles, and staff management are live. Appointment
            scheduling, the clinical module, and billing arrive in later stages.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
