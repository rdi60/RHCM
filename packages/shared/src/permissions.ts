/**
 * Single source of truth for permission codes. Both the Prisma seed
 * (packages/database/prisma/seed.ts) and the NestJS @RequirePermissions
 * guard import from here, so a typo can't silently create a permission
 * nothing checks for, or a check against a permission nothing seeds.
 */

export const PERMISSIONS = {
  // Platform / admin
  USER_MANAGE: "user.manage",
  ROLE_MANAGE: "role.manage",
  ENTITY_MANAGE: "entity.manage",
  ENTITY_SETTINGS_MANAGE: "entity.settings.manage",
  STAFF_MANAGE: "staff.manage",
  DOCTOR_MANAGE: "doctor.manage",
  RESOURCE_MANAGE: "resource.manage",
  AUDIT_LOG_READ: "audit_log.read",

  // Patients (Stage 2+)
  PATIENT_READ: "patient.read",
  PATIENT_REGISTER: "patient.register",
  PATIENT_CHECK_IN: "patient.check_in",
  PATIENT_CROSS_ENTITY_LINK: "patient.cross_entity_link",
  PATIENT_CONSENT_MANAGE: "patient.consent_manage",

  // Scheduling (Stage 3+)
  APPOINTMENT_READ: "appointment.read",
  APPOINTMENT_BOOK: "appointment.book",
  APPOINTMENT_OVERRIDE_CONFLICT: "appointment.override_conflict",
  OT_MANAGE: "ot.manage",

  // Clinical (Stage 4+)
  CLINICAL_READ: "clinical.read",
  CLINICAL_DIAGNOSE: "clinical.diagnose",
  CLINICAL_PLAN_TREATMENT: "clinical.plan_treatment",
  CLINICAL_PERFORM_TREATMENT: "clinical.perform_treatment",
  CLINICAL_PERFORM_OT: "clinical.perform_ot",
  CLINICAL_PRESCRIBE: "clinical.prescribe",
  CLINICAL_NOTE_WRITE: "clinical.note_write",

  // Estimates / billing (Stage 5+)
  ESTIMATE_CREATE: "estimate.create",
  ESTIMATE_APPROVE: "estimate.approve",
  INVOICE_CREATE: "invoice.create",
  INVOICE_VOID: "invoice.void",
  PAYMENT_RECEIVE: "payment.receive",
  PAYMENT_ALLOCATE: "payment.allocate",
  REFUND_APPROVE: "refund.approve",

  // Documents (Stage 6+)
  DOCUMENT_UPLOAD: "document.upload",
  DOCUMENT_DOWNLOAD: "document.download",
  DOCUMENT_DELETE: "document.delete",

  // Reporting
  REPORT_READ: "report.read",
  REPORT_CROSS_ENTITY: "report.cross_entity",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: Array<{
  code: PermissionCode;
  category: string;
  description: string;
}> = [
  { code: PERMISSIONS.USER_MANAGE, category: "admin", description: "Create/disable users and assign entity access" },
  { code: PERMISSIONS.ROLE_MANAGE, category: "admin", description: "Create custom roles and edit role permissions" },
  { code: PERMISSIONS.ENTITY_MANAGE, category: "admin", description: "Manage entities" },
  { code: PERMISSIONS.ENTITY_SETTINGS_MANAGE, category: "admin", description: "Manage entity branding/numbering/tax settings" },
  { code: PERMISSIONS.STAFF_MANAGE, category: "admin", description: "Manage staff records" },
  { code: PERMISSIONS.DOCTOR_MANAGE, category: "admin", description: "Manage doctor records and availability" },
  { code: PERMISSIONS.RESOURCE_MANAGE, category: "admin", description: "Manage chairs/OTs" },
  { code: PERMISSIONS.AUDIT_LOG_READ, category: "admin", description: "Read the audit log" },

  { code: PERMISSIONS.PATIENT_READ, category: "patient", description: "View patient records" },
  { code: PERMISSIONS.PATIENT_REGISTER, category: "patient", description: "Create temporary/permanent patient registrations" },
  { code: PERMISSIONS.PATIENT_CHECK_IN, category: "patient", description: "Check in a patient / match to an existing UHID" },
  { code: PERMISSIONS.PATIENT_CROSS_ENTITY_LINK, category: "patient", description: "Link a patient identity across entities" },
  { code: PERMISSIONS.PATIENT_CONSENT_MANAGE, category: "patient", description: "Record patient consent (treatment, photo/video, data sharing, marketing)" },

  { code: PERMISSIONS.APPOINTMENT_READ, category: "scheduling", description: "View appointment calendars" },
  { code: PERMISSIONS.APPOINTMENT_BOOK, category: "scheduling", description: "Book/reschedule/cancel appointments" },
  { code: PERMISSIONS.APPOINTMENT_OVERRIDE_CONFLICT, category: "scheduling", description: "Book an authorized emergency override slot" },
  { code: PERMISSIONS.OT_MANAGE, category: "scheduling", description: "Manage OT bookings and checklists" },

  { code: PERMISSIONS.CLINICAL_READ, category: "clinical", description: "View clinical records/odontogram" },
  { code: PERMISSIONS.CLINICAL_DIAGNOSE, category: "clinical", description: "Record a diagnosis" },
  { code: PERMISSIONS.CLINICAL_PLAN_TREATMENT, category: "clinical", description: "Create/edit a treatment plan" },
  { code: PERMISSIONS.CLINICAL_PERFORM_TREATMENT, category: "clinical", description: "Mark a treatment session performed" },
  { code: PERMISSIONS.CLINICAL_PERFORM_OT, category: "clinical", description: "Perform/assist an OT procedure" },
  { code: PERMISSIONS.CLINICAL_PRESCRIBE, category: "clinical", description: "Issue a prescription" },
  { code: PERMISSIONS.CLINICAL_NOTE_WRITE, category: "clinical", description: "Author clinical notes" },

  { code: PERMISSIONS.ESTIMATE_CREATE, category: "billing", description: "Create/revise estimates" },
  { code: PERMISSIONS.ESTIMATE_APPROVE, category: "billing", description: "Approve an estimate" },
  { code: PERMISSIONS.INVOICE_CREATE, category: "billing", description: "Create invoices from estimates or direct billing" },
  { code: PERMISSIONS.INVOICE_VOID, category: "billing", description: "Void/correct a posted invoice" },
  { code: PERMISSIONS.PAYMENT_RECEIVE, category: "billing", description: "Record a payment/receipt" },
  { code: PERMISSIONS.PAYMENT_ALLOCATE, category: "billing", description: "Allocate payments/credit to invoices" },
  { code: PERMISSIONS.REFUND_APPROVE, category: "billing", description: "Approve a refund" },

  { code: PERMISSIONS.DOCUMENT_UPLOAD, category: "documents", description: "Upload patient documents" },
  { code: PERMISSIONS.DOCUMENT_DOWNLOAD, category: "documents", description: "Download patient documents" },
  { code: PERMISSIONS.DOCUMENT_DELETE, category: "documents", description: "Delete/retire patient documents" },

  { code: PERMISSIONS.REPORT_READ, category: "reporting", description: "View entity-scoped reports" },
  { code: PERMISSIONS.REPORT_CROSS_ENTITY, category: "reporting", description: "View combined cross-entity reports" },
];
