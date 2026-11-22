import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PatientsService } from "../patients/patients.service";
import type { CreateDentalChartEntryDto } from "./dto/dental-chart.dto";
import type { CreateDiagnosisDto } from "./dto/diagnosis.dto";
import type { AddTreatmentPlanItemDto, CreateTreatmentPlanDto } from "./dto/treatment-plan.dto";
import type { UpdateTreatmentPlanItemStatusDto, UpdateTreatmentPlanStatusDto } from "./dto/treatment-plan-status.dto";
import type { CreateTreatmentSessionDto, UpdateTreatmentSessionDto } from "./dto/treatment-session.dto";
import type { CreateAddendumDto, CreateClinicalNoteDto } from "./dto/clinical-note.dto";
import type { CreatePrescriptionDto } from "./dto/prescription.dto";

@Injectable()
export class ClinicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly patientsService: PatientsService,
  ) {}

  // --- Treatment catalog (global, read-only here) ---------------------------

  async listCatalog(activeOnly: boolean) {
    return this.prisma.client.treatmentCatalog.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  }

  // --- Dental chart (odontogram) --------------------------------------------

  async listDentalChart(patientId: string, entityId: string) {
    await this.patientsService.getPatient(patientId, entityId); // authorizes + 404s
    return this.prisma.client.dentalChartEntry.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
    });
  }

  async createDentalChartEntry(patientId: string, dto: CreateDentalChartEntryDto, actorUserId: string) {
    await this.patientsService.getPatient(patientId, dto.entityId);

    if (dto.visitId) {
      const visit = await this.prisma.client.visit.findUnique({ where: { id: dto.visitId } });
      if (!visit || visit.entityId !== dto.entityId || visit.patientId !== patientId) {
        throw new BadRequestException("visitId does not belong to this patient/entity");
      }
    }

    const entry = await this.prisma.client.dentalChartEntry.create({
      data: {
        patientId,
        toothNumber: dto.toothNumber,
        dentition: dto.dentition ?? "PERMANENT",
        surface: dto.surface,
        condition: dto.condition,
        status: dto.status,
        recordedById: actorUserId,
        visitId: dto.visitId,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.dental_chart_entry_created",
      resourceType: "dental_chart_entry",
      resourceId: entry.id,
      after: { toothNumber: dto.toothNumber, condition: dto.condition },
    });
    return entry;
  }

  /** Resolves the acting user's own Doctor profile, if they have one (not every clinical actor is a doctor). */
  private async getActorDoctorId(userId: string): Promise<string | null> {
    const doctor = await this.prisma.client.doctor.findUnique({ where: { userId } });
    return doctor?.id ?? null;
  }

  // --- Diagnoses --------------------------------------------------------------

  private async getOwnVisit(visitId: string, entityId: string) {
    const visit = await this.prisma.client.visit.findUnique({ where: { id: visitId } });
    if (!visit || visit.entityId !== entityId) throw new NotFoundException("Visit not found for this entity");
    return visit;
  }

  async listDiagnoses(visitId: string, entityId: string) {
    await this.getOwnVisit(visitId, entityId);
    return this.prisma.client.diagnosis.findMany({ where: { visitId }, orderBy: { diagnosedAt: "desc" } });
  }

  async createDiagnosis(visitId: string, dto: CreateDiagnosisDto, actorUserId: string) {
    const visit = await this.getOwnVisit(visitId, dto.entityId);
    const actorDoctorId = await this.getActorDoctorId(actorUserId);
    const diagnosis = await this.prisma.client.diagnosis.create({
      data: {
        visitId,
        patientId: visit.patientId,
        toothNumber: dto.toothNumber,
        diagnosisCode: dto.diagnosisCode,
        description: dto.description,
        diagnosedById: actorDoctorId,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.diagnosis_recorded",
      resourceType: "diagnosis",
      resourceId: diagnosis.id,
      after: { description: dto.description, toothNumber: dto.toothNumber },
    });
    return diagnosis;
  }

  // --- Treatment plans ----------------------------------------------------------

  async listTreatmentPlans(patientId: string, entityId: string) {
    await this.patientsService.getPatient(patientId, entityId);
    return this.prisma.client.treatmentPlan.findMany({
      where: { patientId, entityId },
      include: {
        items: {
          include: {
            treatmentCatalog: true,
            plannedDoctor: { select: { id: true, fullName: true } },
            sessions: { include: { assignedDoctor: { select: { id: true, fullName: true } }, performedByDoctor: { select: { id: true, fullName: true } } } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async resolveCatalogCost(treatmentCatalogId: string, estimatedCost?: number) {
    if (estimatedCost !== undefined) return estimatedCost;
    const catalog = await this.prisma.client.treatmentCatalog.findUnique({ where: { id: treatmentCatalogId } });
    if (!catalog) throw new BadRequestException("Unknown treatmentCatalogId");
    return catalog.defaultPrice;
  }

  async createTreatmentPlan(patientId: string, dto: CreateTreatmentPlanDto, actorUserId: string) {
    await this.patientsService.getPatient(patientId, dto.entityId);
    if (dto.visitId) await this.getOwnVisit(dto.visitId, dto.entityId);

    const itemsData = await Promise.all(
      dto.items.map(async (item, idx) => ({
        toothNumber: item.toothNumber,
        treatmentCatalogId: item.treatmentCatalogId,
        plannedDoctorId: item.plannedDoctorId,
        quantity: item.quantity ?? 1,
        estimatedCost: await this.resolveCatalogCost(item.treatmentCatalogId, item.estimatedCost),
        sortOrder: idx,
      })),
    );

    const plan = await this.prisma.client.treatmentPlan.create({
      data: {
        patientId,
        entityId: dto.entityId,
        visitId: dto.visitId,
        createdById: actorUserId,
        status: "ACTIVE",
        items: { create: itemsData },
      },
      include: { items: true },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.treatment_plan_created",
      resourceType: "treatment_plan",
      resourceId: plan.id,
      after: { itemCount: itemsData.length },
    });
    return plan;
  }

  private async getOwnPlan(planId: string, entityId: string) {
    const plan = await this.prisma.client.treatmentPlan.findUnique({ where: { id: planId } });
    if (!plan || plan.entityId !== entityId) throw new NotFoundException("Treatment plan not found for this entity");
    return plan;
  }

  async updateTreatmentPlanStatus(planId: string, dto: UpdateTreatmentPlanStatusDto, actorUserId: string) {
    await this.getOwnPlan(planId, dto.entityId);
    const updated = await this.prisma.client.treatmentPlan.update({ where: { id: planId }, data: { status: dto.status } });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.treatment_plan_status_changed",
      resourceType: "treatment_plan",
      resourceId: planId,
      after: { status: dto.status },
    });
    return updated;
  }

  async addTreatmentPlanItem(planId: string, dto: AddTreatmentPlanItemDto, actorUserId: string) {
    await this.getOwnPlan(planId, dto.entityId);
    const maxSort = await this.prisma.client.treatmentPlanItem.aggregate({ where: { treatmentPlanId: planId }, _max: { sortOrder: true } });
    const item = await this.prisma.client.treatmentPlanItem.create({
      data: {
        treatmentPlanId: planId,
        toothNumber: dto.toothNumber,
        treatmentCatalogId: dto.treatmentCatalogId,
        plannedDoctorId: dto.plannedDoctorId,
        quantity: dto.quantity ?? 1,
        estimatedCost: await this.resolveCatalogCost(dto.treatmentCatalogId, dto.estimatedCost),
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.treatment_plan_item_added",
      resourceType: "treatment_plan_item",
      resourceId: item.id,
    });
    return item;
  }

  private async getOwnPlanItem(itemId: string, entityId: string) {
    const item = await this.prisma.client.treatmentPlanItem.findUnique({ where: { id: itemId }, include: { treatmentPlan: true } });
    if (!item || item.treatmentPlan.entityId !== entityId) throw new NotFoundException("Treatment plan item not found for this entity");
    return item;
  }

  async updateTreatmentPlanItemStatus(itemId: string, dto: UpdateTreatmentPlanItemStatusDto, actorUserId: string) {
    await this.getOwnPlanItem(itemId, dto.entityId);
    const updated = await this.prisma.client.treatmentPlanItem.update({ where: { id: itemId }, data: { status: dto.status } });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.treatment_plan_item_status_changed",
      resourceType: "treatment_plan_item",
      resourceId: itemId,
      after: { status: dto.status },
    });
    return updated;
  }

  // --- Treatment sessions ("Treatment ID") -------------------------------------

  async createTreatmentSession(itemId: string, dto: CreateTreatmentSessionDto, actorUserId: string) {
    const item = await this.getOwnPlanItem(itemId, dto.entityId);
    if (dto.visitId) await this.getOwnVisit(dto.visitId, dto.entityId);
    const actorDoctorId = await this.getActorDoctorId(actorUserId);

    const session = await this.prisma.client.treatmentSession.create({
      data: {
        treatmentPlanItemId: itemId,
        visitId: dto.visitId,
        entityId: dto.entityId,
        toothNumber: dto.toothNumber ?? item.toothNumber,
        procedureCode: dto.procedureCode,
        plannedByDoctorId: actorDoctorId,
        assignedDoctorId: dto.assignedDoctorId ?? item.plannedDoctorId,
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
        estimatedCost: dto.estimatedCost ?? item.estimatedCost,
      },
    });

    if (item.status === "PLANNED") {
      await this.prisma.client.treatmentPlanItem.update({ where: { id: itemId }, data: { status: "IN_PROGRESS" } });
    }

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.treatment_session_created",
      resourceType: "treatment_session",
      resourceId: session.id,
    });
    return session;
  }

  private async getOwnSession(sessionId: string, entityId: string) {
    const session = await this.prisma.client.treatmentSession.findUnique({ where: { id: sessionId } });
    if (!session || session.entityId !== entityId) throw new NotFoundException("Treatment session not found for this entity");
    return session;
  }

  /** The "mark performed" action — also advances the parent plan item when this was its last open session. */
  async updateTreatmentSession(sessionId: string, dto: UpdateTreatmentSessionDto, actorUserId: string) {
    const session = await this.getOwnSession(sessionId, dto.entityId);
    const actorDoctorId = await this.getActorDoctorId(actorUserId);

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.treatmentSession.update({
        where: { id: sessionId },
        data: {
          status: dto.status,
          performedByDoctorId: dto.status === "COMPLETED" ? (dto.performedByDoctorId ?? actorDoctorId ?? undefined) : dto.performedByDoctorId,
          actualDate: dto.actualDate ? new Date(dto.actualDate) : dto.status === "COMPLETED" ? new Date() : undefined,
          actualBilledAmount: dto.actualBilledAmount,
          clinicalRemarks: dto.clinicalRemarks,
        },
      });

      if (dto.assistantStaffIds) {
        await tx.treatmentSessionAssistant.deleteMany({ where: { treatmentSessionId: sessionId } });
        await tx.treatmentSessionAssistant.createMany({
          data: dto.assistantStaffIds.map((staffId) => ({ treatmentSessionId: sessionId, staffId })),
          skipDuplicates: true,
        });
      }

      if (dto.status === "COMPLETED") {
        const openSessions = await tx.treatmentSession.count({
          where: { treatmentPlanItemId: session.treatmentPlanItemId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        });
        if (openSessions === 0) {
          await tx.treatmentPlanItem.update({ where: { id: session.treatmentPlanItemId }, data: { status: "COMPLETED" } });
        }
      }

      return result;
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.treatment_session_updated",
      resourceType: "treatment_session",
      resourceId: sessionId,
      after: { status: dto.status },
    });
    return updated;
  }

  // --- Clinical notes (append-only) --------------------------------------------

  async listClinicalNotes(visitId: string, entityId: string) {
    await this.getOwnVisit(visitId, entityId);
    return this.prisma.client.clinicalNote.findMany({
      where: { visitId },
      include: { authoredBy: { select: { id: true, email: true } } },
      orderBy: { authoredAt: "asc" },
    });
  }

  async createClinicalNote(visitId: string, dto: CreateClinicalNoteDto, actorUserId: string) {
    const visit = await this.getOwnVisit(visitId, dto.entityId);
    const note = await this.prisma.client.clinicalNote.create({
      data: {
        visitId,
        patientId: visit.patientId,
        authoredById: actorUserId,
        noteType: dto.noteType ?? "general",
        body: dto.body,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.note_added",
      resourceType: "clinical_note",
      resourceId: note.id,
    });
    return note;
  }

  async createAddendum(noteId: string, dto: CreateAddendumDto, actorUserId: string) {
    const original = await this.prisma.client.clinicalNote.findUnique({ where: { id: noteId }, include: { visit: true } });
    if (!original || original.visit.entityId !== dto.entityId) throw new NotFoundException("Clinical note not found for this entity");

    const addendum = await this.prisma.client.clinicalNote.create({
      data: {
        visitId: original.visitId,
        patientId: original.patientId,
        authoredById: actorUserId,
        noteType: original.noteType,
        body: dto.body,
        isAddendum: true,
        supersedesNoteId: noteId,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.note_addendum_added",
      resourceType: "clinical_note",
      resourceId: addendum.id,
      after: { supersedesNoteId: noteId },
    });
    return addendum;
  }

  // --- Prescriptions --------------------------------------------------------------

  async listPrescriptions(visitId: string, entityId: string) {
    await this.getOwnVisit(visitId, entityId);
    return this.prisma.client.prescription.findMany({ where: { visitId }, orderBy: { prescribedAt: "desc" } });
  }

  async createPrescription(visitId: string, dto: CreatePrescriptionDto, actorUserId: string) {
    const visit = await this.getOwnVisit(visitId, dto.entityId);
    const actorDoctorId = await this.getActorDoctorId(actorUserId);
    if (!actorDoctorId) throw new BadRequestException("Only a doctor account can issue a prescription");

    const prescription = await this.prisma.client.prescription.create({
      data: {
        visitId,
        patientId: visit.patientId,
        entityId: dto.entityId,
        prescribedById: actorDoctorId,
        itemsJson: dto.items as any,
        notes: dto.notes,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "clinical.prescription_issued",
      resourceType: "prescription",
      resourceId: prescription.id,
      after: { itemCount: dto.items.length },
    });
    return prescription;
  }
}
