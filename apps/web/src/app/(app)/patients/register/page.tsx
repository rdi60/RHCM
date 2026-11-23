"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DoctorOption {
  id: string;
  fullName: string;
}

export default function RegisterPatientPage() {
  const { selectedEntityId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [ageMode, setAgeMode] = useState<"dob" | "age">("dob");

  const doctorsQuery = useQuery({
    queryKey: ["doctor-directory", selectedEntityId],
    queryFn: () => api.get<DoctorOption[]>(`/doctors/directory?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/temp-registrations", { entityId: selectedEntityId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["temp-registrations", selectedEntityId] });
      router.push("/patients");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to register"),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      fullName: String(form.get("fullName") ?? "").trim(),
    };
    const phone = String(form.get("phone") ?? "").trim();
    if (phone) payload.phone = phone;
    const gender = String(form.get("gender") ?? "");
    if (gender) payload.gender = gender;
    const visitReason = String(form.get("visitReason") ?? "").trim();
    if (visitReason) payload.visitReason = visitReason;
    const preferredDoctorId = String(form.get("preferredDoctorId") ?? "");
    if (preferredDoctorId) payload.preferredDoctorId = preferredDoctorId;

    if (ageMode === "dob") {
      const dob = String(form.get("dob") ?? "");
      if (dob) payload.dob = dob;
    } else {
      const ageYears = String(form.get("ageYears") ?? "");
      if (ageYears) payload.ageYears = Number(ageYears);
    }

    if (!payload.fullName) {
      setError("Name is required.");
      return;
    }

    createMutation.mutate(payload);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading-page">New Registration</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Temporary registration</CardTitle>
          <CardDescription>
            Capture whatever's known now — only the name is required. A permanent UHID is generated at check-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName">Name *</Label>
              <Input id="fullName" name="fullName" required autoFocus />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" placeholder="+91-9XXXXXXXXX" />
            </div>

            <div className="flex gap-4">
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor={ageMode === "dob" ? "dob" : "ageYears"}>{ageMode === "dob" ? "Date of birth" : "Age (years)"}</Label>
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => setAgeMode(ageMode === "dob" ? "age" : "dob")}
                  >
                    {ageMode === "dob" ? "Don't know DOB? Enter age" : "Use date of birth instead"}
                  </button>
                </div>
                {ageMode === "dob" ? (
                  <Input id="dob" name="dob" type="date" />
                ) : (
                  <Input id="ageYears" name="ageYears" type="number" min={0} max={130} />
                )}
              </div>
              <div className="flex flex-col gap-1.5 w-40">
                <Label htmlFor="gender">Gender</Label>
                <select id="gender" name="gender" defaultValue="" className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm">
                  <option value="">Not specified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="visitReason">Visit reason</Label>
              <Input id="visitReason" name="visitReason" placeholder="e.g. tooth pain, routine checkup" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preferredDoctorId">Preferred doctor</Label>
              <select id="preferredDoctorId" name="preferredDoctorId" defaultValue="" className="h-10 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 text-sm">
                <option value="">No preference</option>
                {doctorsQuery.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving…" : "Register"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
