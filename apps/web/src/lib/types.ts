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

export interface AuditLogRow {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
}
