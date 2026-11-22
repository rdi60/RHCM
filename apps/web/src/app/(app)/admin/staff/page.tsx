"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { DoctorRow, StaffRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function StaffPage() {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const canManageDoctors = hasPermission(PERMISSIONS.DOCTOR_MANAGE);
  const canManageStaff = hasPermission(PERMISSIONS.STAFF_MANAGE);

  const doctorsQuery = useQuery({
    queryKey: ["doctors", selectedEntityId],
    queryFn: () => api.get<DoctorRow[]>(`/doctors?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId) && canManageDoctors,
  });

  const staffQuery = useQuery({
    queryKey: ["staff", selectedEntityId],
    queryFn: () => api.get<StaffRow[]>(`/staff?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId) && canManageStaff,
  });

  const [doctorName, setDoctorName] = useState("");
  const [doctorReg, setDoctorReg] = useState("");
  const createDoctorMutation = useMutation({
    mutationFn: () =>
      api.post<DoctorRow>("/doctors", { entityId: selectedEntityId, fullName: doctorName, registrationNumber: doctorReg }),
    onSuccess: () => {
      setDoctorName("");
      setDoctorReg("");
      queryClient.invalidateQueries({ queryKey: ["doctors", selectedEntityId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create doctor"),
  });

  const [staffName, setStaffName] = useState("");
  const [staffDesignation, setStaffDesignation] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const createStaffMutation = useMutation({
    mutationFn: () =>
      api.post<StaffRow>("/staff", {
        entityId: selectedEntityId,
        fullName: staffName,
        designation: staffDesignation,
        employeeCode: staffCode,
      }),
    onSuccess: () => {
      setStaffName("");
      setStaffDesignation("");
      setStaffCode("");
      queryClient.invalidateQueries({ queryKey: ["staff", selectedEntityId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create staff member"),
  });

  if (!canManageDoctors && !canManageStaff) {
    return <p className="text-muted-foreground">You do not have access to staff management for this entity.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Doctors & Staff</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {canManageDoctors && (
        <Card>
          <CardHeader>
            <CardTitle>Doctors</CardTitle>
            <CardDescription>Enrolled at this entity. A doctor does not need a login account.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                setError(null);
                createDoctorMutation.mutate();
              }}
              className="flex flex-wrap items-end gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="doctorName">Full name</Label>
                <Input id="doctorName" required value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="doctorReg">Registration number</Label>
                <Input id="doctorReg" required value={doctorReg} onChange={(e) => setDoctorReg(e.target.value)} />
              </div>
              <Button type="submit" disabled={createDoctorMutation.isPending}>
                {createDoctorMutation.isPending ? "Adding…" : "Add doctor"}
              </Button>
            </form>

            <div className="flex flex-col divide-y divide-border">
              {doctorsQuery.data?.map((doctor) => (
                <div key={doctor.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium">{doctor.fullName}</p>
                    <p className="text-sm text-muted-foreground">{doctor.registrationNumber}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {canManageStaff && (
        <Card>
          <CardHeader>
            <CardTitle>Staff</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                setError(null);
                createStaffMutation.mutate();
              }}
              className="flex flex-wrap items-end gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staffName">Full name</Label>
                <Input id="staffName" required value={staffName} onChange={(e) => setStaffName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staffDesignation">Designation</Label>
                <Input id="staffDesignation" required value={staffDesignation} onChange={(e) => setStaffDesignation(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staffCode">Employee code</Label>
                <Input id="staffCode" required value={staffCode} onChange={(e) => setStaffCode(e.target.value)} />
              </div>
              <Button type="submit" disabled={createStaffMutation.isPending}>
                {createStaffMutation.isPending ? "Adding…" : "Add staff"}
              </Button>
            </form>

            <div className="flex flex-col divide-y divide-border">
              {staffQuery.data?.map((member) => (
                <div key={member.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium">{member.fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.designation} · {member.employeeCode}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
