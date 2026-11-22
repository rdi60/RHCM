export interface EntityAccessGrant {
  entityId: string;
  entityCode: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface CurrentUser {
  id: string;
  email: string;
  mfaEnabled: boolean;
  access: EntityAccessGrant[];
}

export interface EntitySummary {
  id: string;
  code: string;
  displayName: string;
  roleName: string;
}

export interface EntitySettings {
  id: string;
  entityId: string;
  brandingJson: Record<string, unknown> | null;
  invoicePrefix: string;
  receiptPrefix: string;
  estimatePrefix: string;
  gstin: string | null;
  addressJson: Record<string, unknown> | null;
  contactJson: Record<string, unknown> | null;
}

export interface ClinicResourceRow {
  id: string;
  entityId: string;
  type: "CHAIR" | "OT";
  number: number;
  label: string | null;
  isActive: boolean;
}

export interface RoleRow {
  id: string;
  name: string;
  isSystem: boolean;
  entityId: string | null;
  permissions: string[];
}

export interface PermissionCatalogEntry {
  code: string;
  category: string;
  description: string;
}

export interface UserAccessRow {
  accessId: string;
  userId: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
  mfaEnabled: boolean;
  roleId: string;
  roleName: string;
  grantedAt: string;
}

export interface DoctorRow {
  id: string;
  fullName: string;
  registrationNumber: string;
  qualificationsJson: string[] | null;
  specialtiesJson: string[] | null;
  defaultConsultationFee: string;
  isActive: boolean;
  userId: string | null;
}

export interface StaffRow {
  id: string;
  fullName: string;
  designation: string;
  employeeCode: string;
  isActive: boolean;
  userId: string | null;
}

export type Gender = "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";
export type TempRegistrationStatus = "OPEN" | "CHECKED_IN" | "EXPIRED" | "DISCARDED";

export interface PatientEntityLinkRow {
  id: string;
  entityId: string;
  entity: { id: string; code: string; displayName: string };
  firstVisitAt: string;
}

export interface PatientRow {
  id: string;
  uhid: string;
  fullName: string;
  dob: string | null;
  ageYears: number | null;
  gender: Gender;
  phone: string | null;
  email: string | null;
  addressJson: Record<string, unknown> | null;
  emergencyContactJson: Record<string, unknown> | null;
  guardianJson: Record<string, unknown> | null;
  medicalAlertsJson: string[] | null;
  allergiesJson: string[] | null;
  medicalHistoryJson: string[] | null;
  status: "ACTIVE" | "INACTIVE" | "DECEASED" | "MERGED";
  entityLinks?: PatientEntityLinkRow[];
}

export interface TemporaryRegistrationRow {
  id: string;
  tempId: string;
  entityId: string;
  fullName: string;
  phone: string | null;
  dob: string | null;
  ageYears: number | null;
  gender: Gender;
  visitReason: string | null;
  preferredDoctorId: string | null;
  preferredDoctor?: { id: string; fullName: string } | null;
  status: TempRegistrationStatus;
  matchedPatientId: string | null;
  createdAt: string;
}

export interface PatientSearchResult {
  patients: PatientRow[];
  temporaryRegistrations: TemporaryRegistrationRow[];
}

export interface CrossEntityMatch {
  id: string;
  uhid: string;
  fullName: string;
  phone: string | null;
  linkedEntities: string[];
}

export type AppointmentType = "CONSULTATION" | "TREATMENT" | "FOLLOW_UP" | "EMERGENCY";
export type AppointmentStatus =
  | "BOOKED"
  | "CONFIRMED"
  | "ARRIVED"
  | "CHECKED_IN"
  | "WAITING"
  | "IN_TREATMENT"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "RESCHEDULED";
export type VisitStatus = "WAITING" | "IN_TREATMENT" | "COMPLETED" | "CANCELLED";

export interface AppointmentRow {
  id: string;
  entityId: string;
  patientId: string | null;
  patient?: { id: string; fullName: string; uhid: string; phone?: string | null } | null;
  temporaryRegistrationId: string | null;
  temporaryRegistration?: { id: string; fullName: string; tempId: string; phone?: string | null } | null;
  doctorId: string;
  doctor?: { id: string; fullName: string };
  resourceId: string | null;
  resource?: { id: string; type: "CHAIR" | "OT"; number: number; label: string | null } | null;
  startAt: string;
  endAt: string;
  type: AppointmentType;
  status: AppointmentStatus;
  procedureHint: string | null;
  remarks: string | null;
  isEmergencyOverride: boolean;
}

export interface AvailabilitySlot {
  startAt: string;
  endAt: string;
  available: boolean;
}

export interface AvailabilityResponse {
  onLeave: boolean;
  slots: AvailabilitySlot[];
}

export interface VisitRow {
  id: string;
  visitNumber: string;
  entityId: string;
  patientId: string;
  patient?: { id: string; fullName: string; uhid: string };
  appointmentId: string | null;
  doctorId: string | null;
  doctor?: { id: string; fullName: string } | null;
  resourceId: string | null;
  resource?: { id: string; type: "CHAIR" | "OT"; number: number; label: string | null } | null;
  chiefComplaint: string | null;
  status: VisitStatus;
  checkedInAt: string;
  checkedOutAt: string | null;
}

export interface AuditLogRow {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
}
