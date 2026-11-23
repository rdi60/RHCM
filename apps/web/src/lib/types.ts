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

export interface TreatmentCatalogRow {
  id: string;
  code: string;
  name: string;
  category: string;
  defaultDurationMinutes: number;
  defaultPrice: string;
  isActive: boolean;
}

export interface DentalChartEntryRow {
  id: string;
  patientId: string;
  toothNumber: number;
  dentition: "PERMANENT" | "DECIDUOUS";
  surface: string | null;
  condition: string;
  status: string | null;
  recordedAt: string;
  recordedById: string | null;
  visitId: string | null;
}

export interface DiagnosisRow {
  id: string;
  visitId: string;
  patientId: string;
  toothNumber: number | null;
  diagnosisCode: string | null;
  description: string;
  diagnosedById: string | null;
  diagnosedAt: string;
}

export type TreatmentPlanStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type TreatmentPlanItemStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TreatmentSessionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface TreatmentSessionRow {
  id: string;
  treatmentPlanItemId: string;
  visitId: string | null;
  toothNumber: number | null;
  procedureCode: string | null;
  assignedDoctor?: { id: string; fullName: string } | null;
  performedByDoctor?: { id: string; fullName: string } | null;
  plannedDate: string | null;
  actualDate: string | null;
  status: TreatmentSessionStatus;
  estimatedCost: string;
  actualBilledAmount: string | null;
  clinicalRemarks: string | null;
}

export interface TreatmentPlanItemRow {
  id: string;
  toothNumber: number | null;
  treatmentCatalogId: string;
  treatmentCatalog: TreatmentCatalogRow;
  plannedDoctor?: { id: string; fullName: string } | null;
  quantity: number;
  estimatedCost: string;
  status: TreatmentPlanItemStatus;
  sortOrder: number;
  sessions: TreatmentSessionRow[];
}

export interface TreatmentPlanRow {
  id: string;
  patientId: string;
  entityId: string;
  visitId: string | null;
  status: TreatmentPlanStatus;
  createdAt: string;
  items: TreatmentPlanItemRow[];
}

export interface ClinicalNoteRow {
  id: string;
  visitId: string;
  patientId: string;
  authoredById: string | null;
  authoredBy?: { id: string; email: string } | null;
  authoredAt: string;
  noteType: string;
  body: string;
  isAddendum: boolean;
  supersedesNoteId: string | null;
}

export interface PrescriptionItem {
  drugName: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export interface PrescriptionRow {
  id: string;
  visitId: string;
  patientId: string;
  prescribedById: string | null;
  prescribedAt: string;
  itemsJson: PrescriptionItem[];
  notes: string | null;
}

export interface VisitDetailRow extends VisitRow {
  clinicalFindings: string | null;
  diagnosisSummary: string | null;
  treatmentAdvice: string | null;
  nextAppointmentRecommendedAt: string | null;
  appointment?: AppointmentRow | null;
}

// --- Billing (Stage 5) ------------------------------------------------------

export interface TaxProfileRow {
  id: string;
  entityId: string;
  name: string;
  rate: string;
  componentsJson: Record<string, number> | null;
  isActive: boolean;
}

export interface EntityTreatmentPriceRow {
  entityId: string;
  treatmentCatalogId: string;
  price: string;
  treatmentCatalog: TreatmentCatalogRow;
}

export type EstimateStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "SUPERSEDED" | "CONVERTED";

export interface EstimateItemRow {
  id: string;
  estimateId: string;
  treatmentPlanItemId: string | null;
  toothNumber: number | null;
  plannedDoctorId: string | null;
  plannedDoctor?: { id: string; fullName: string } | null;
  treatmentCatalogId: string;
  treatmentCatalog?: TreatmentCatalogRow;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  taxProfileId: string | null;
  taxProfile?: TaxProfileRow | null;
  lineTotal: string;
  invoicedQuantity: number;
  invoicedAmount: string;
}

export interface EstimateRow {
  id: string;
  estimateNumber: string;
  entityId: string;
  patientId: string;
  visitId: string | null;
  version: number;
  supersedesEstimateId: string | null;
  validUntil: string | null;
  status: EstimateStatus;
  grossTotal: string;
  discountTotal: string;
  taxTotal: string;
  netTotal: string;
  createdAt: string;
  items: EstimateItemRow[];
}

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID";

export interface InvoiceItemRow {
  id: string;
  invoiceId: string;
  estimateItemId: string | null;
  treatmentSessionId: string | null;
  toothNumber: number | null;
  plannedByDoctorId: string | null;
  performedByDoctorId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  taxProfileId: string | null;
  lineTotal: string;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  entityId: string;
  patientId: string;
  visitId: string | null;
  invoiceDate: string;
  status: InvoiceStatus;
  grossTotal: string;
  discountTotal: string;
  taxTotal: string;
  netTotal: string;
  paidAmount: string;
  voidedAt: string | null;
  voidReason: string | null;
  correctedByInvoiceId: string | null;
  balanceDue?: string;
  items: InvoiceItemRow[];
}

export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";

export interface ReceiptRow {
  id: string;
  receiptNumber: string;
  paymentId: string;
  entityId: string;
  issuedAt: string;
  cashierId: string | null;
  remarks: string | null;
}

export interface PaymentAllocationRow {
  id: string;
  paymentId: string;
  invoiceId: string;
  invoice?: { id: string; invoiceNumber: string };
  amount: string;
  allocatedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface PaymentRow {
  id: string;
  entityId: string;
  patientId: string;
  paymentDate: string;
  amount: string;
  mode: PaymentMode;
  transactionReference: string | null;
  remarks: string | null;
  receipt?: ReceiptRow | null;
  allocations?: PaymentAllocationRow[];
}

export type CreditNoteStatus = "ISSUED" | "VOID";

export interface CreditNoteRow {
  id: string;
  entityId: string;
  patientId: string;
  invoiceId: string | null;
  amount: string;
  reason: string;
  issuedAt: string;
  status: CreditNoteStatus;
}

export type RefundStatus = "REQUESTED" | "APPROVED" | "COMPLETED" | "REJECTED";

export interface RefundRow {
  id: string;
  entityId: string;
  patientId: string;
  paymentId: string | null;
  amount: string;
  reason: string;
  mode: PaymentMode;
  status: RefundStatus;
  requestedAt: string;
  refundedAt: string | null;
}

export interface AuditLogRow {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
}
