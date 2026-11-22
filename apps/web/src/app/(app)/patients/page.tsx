"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { PatientSearchResult, TemporaryRegistrationRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus } from "lucide-react";

export default function PatientsPage() {
  const { selectedEntityId, hasPermission } = useAuth();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const canRead = hasPermission(PERMISSIONS.PATIENT_READ);
  const canRegister = hasPermission(PERMISSIONS.PATIENT_REGISTER);
  const canCheckIn = hasPermission(PERMISSIONS.PATIENT_CHECK_IN);

  const searchQuery = useQuery({
    queryKey: ["patient-search", selectedEntityId, submittedQuery],
    queryFn: () => api.get<PatientSearchResult>(`/patients/search?entityId=${selectedEntityId}&q=${encodeURIComponent(submittedQuery)}`),
    enabled: Boolean(selectedEntityId) && canRead && submittedQuery.length > 0,
  });

  const openRegsQuery = useQuery({
    queryKey: ["temp-registrations", selectedEntityId, "OPEN"],
    queryFn: () => api.get<TemporaryRegistrationRow[]>(`/temp-registrations?entityId=${selectedEntityId}&status=OPEN`),
    enabled: Boolean(selectedEntityId) && canRead,
  });

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSubmittedQuery(query);
  }

  if (!canRead && !canRegister) {
    return <p className="text-muted-foreground">You do not have access to patients for this entity.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Patients</h1>
        {canRegister && (
          <Link href="/patients/register">
            <Button>
              <UserPlus className="h-4 w-4" />
              New registration
            </Button>
          </Link>
        )}
      </div>

      {canRead && (
        <Card>
          <CardHeader>
            <CardTitle>Search</CardTitle>
            <CardDescription>By UHID, temporary ID, name, or phone number.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                autoFocus
                placeholder="RD-000001, TMP-000123, name, or phone…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit">
                <Search className="h-4 w-4" />
                Search
              </Button>
            </form>

            {searchQuery.data && (
              <div className="flex flex-col gap-3">
                {searchQuery.data.patients.length === 0 && searchQuery.data.temporaryRegistrations.length === 0 && (
                  <p className="text-sm text-muted-foreground">No matches.</p>
                )}
                {searchQuery.data.patients.map((p) => (
                  <Link
                    key={p.id}
                    href={`/patients/${p.id}`}
                    className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted"
                  >
                    <div>
                      <p className="font-medium">{p.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.uhid} {p.phone ? `· ${p.phone}` : ""}
                      </p>
                    </div>
                    <Badge variant="muted">Patient</Badge>
                  </Link>
                ))}
                {searchQuery.data.temporaryRegistrations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <p className="font-medium">{r.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.tempId} {r.phone ? `· ${r.phone}` : ""}
                      </p>
                    </div>
                    {canCheckIn ? (
                      <Link href={`/patients/check-in/${r.id}`}>
                        <Button size="sm">Check in</Button>
                      </Link>
                    ) : (
                      <Badge variant="muted">Open registration</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canRead && (
        <Card>
          <CardHeader>
            <CardTitle>Waiting to check in</CardTitle>
            <CardDescription>Open temporary registrations for this entity.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {openRegsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
            {openRegsQuery.data?.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="font-medium">{r.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.tempId}
                    {r.phone ? ` · ${r.phone}` : ""}
                    {r.visitReason ? ` · ${r.visitReason}` : ""}
                  </p>
                </div>
                {canCheckIn && (
                  <Link href={`/patients/check-in/${r.id}`}>
                    <Button size="sm">Check in</Button>
                  </Link>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
