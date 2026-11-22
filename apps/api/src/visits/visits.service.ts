import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { nextVisitNumber, type PrismaClient, type Prisma } from "@rhcm/database";
import { istToUtc, addMinutes } from "../common/time/ist";
import type { UpdateVisitStatusDto } from "./dto/update-visit-status.dto";
import type { AssignVisitDto } from "./dto/assign-visit.dto";
import type { UpdateVisitClinicalDto } from "./dto/update-visit-clinical.dto";

type VisitStatus = "WAITING" | "IN_TREATMENT" | "COMPLETED" | "CANCELLED";

const VISIT_ALLOWED_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  WAITING: ["IN_TREATMENT", "CANCELLED"],
  IN_TREATMENT: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export interface CreateVisitInput {
  entityId: string;
  patientId: string;
  appointmentId?: string | null;
  doctorId?: string | null;
  resourceId?: string | null;
  chiefComplaint?: string | null;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Internal: called from PatientsService.checkIn inside its own transaction (pass `tx`), or standalone (omit it). */
  async createForCheckIn(tx: PrismaClient | Prisma.TransactionClient | null, input: CreateVisitInput) {
    const client = tx ?? this.prisma.client;
    const visitNumber = await nextVisitNumber(client, input.entityId);
    return client.visit.create({
      data: {
        visitNumber,
        entityId: input.entityId,
        patientId: input.patientId,
        appointmentId: input.appointmentId ?? undefined,
        doctorId: input.doctorId ?? undefined,
        resourceId: input.resourceId ?? undefined,
        chiefComplaint: input.chiefComplaint ?? undefined,
      },
    });
  }

  async listForEntity(entityId: string, opts: { status?: string; date?: string; patientId?: string }) {
    const where: any = { entityId };
    if (opts.status) where.status = opts.status;
    if (opts.patientId) where.patientId = opts.patientId;
    if (opts.date) {
      const dayStart = istToUtc(opts.date, "00:00");
      const dayEnd = addMinutes(dayStart, 24 * 60);
      where.checkedInAt = { gte: dayStart, lt: dayEnd };
    }
    return this.prisma.client.visit.findMany({
      where,
      include: {
        patient: { select: { id: true, fullName: true, uhid: true } },
        doctor: { select: { id: true, fullName: true } },
        resource: { select: { id: true, type: true, number: true, label: true } },
      },
      orderBy: { checkedInAt: "asc" }, // Waiting List wants oldest-first (FIFO); callers wanting newest-first (e.g. patient history) can reverse client-side.
    });
  }

  private async getOwn(id: string, entityId: string) {
    const visit = await this.prisma.client.visit.findUnique({ where: { id } });
    if (!visit || visit.entityId !== entityId) throw new NotFoundException("Visit not found for this entity");
    return visit;
  }

  async updateStatus(id: string, dto: UpdateVisitStatusDto, actorUserId: string) {
    const visit = await this.getOwn(id, dto.entityId);
    const allowed = VISIT_ALLOWED_TRANSITIONS[visit.status as VisitStatus];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot move a visit from ${visit.status} to ${dto.status}`);
    }

    const isTerminal = dto.status === "COMPLETED" || dto.status === "CANCELLED";
    const updated = await this.prisma.client.visit.update({
      where: { id },
      data: { status: dto.status, checkedOutAt: isTerminal ? new Date() : undefined },
    });

    if (visit.appointmentId && dto.status === "COMPLETED") {
      await this.prisma.client.appointment.update({ where: { id: visit.appointmentId }, data: { status: "COMPLETED" } });
    } else if (visit.appointmentId && dto.status === "CANCELLED") {
      await this.prisma.client.appointment.update({ where: { id: visit.appointmentId }, data: { status: "CANCELLED" } });
    }

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "visit.status_changed",
      resourceType: "visit",
      resourceId: id,
      before: { status: visit.status },
      after: { status: dto.status },
    });
    return updated;
  }

  async assign(id: string, dto: AssignVisitDto, actorUserId: string) {
    const visit = await this.getOwn(id, dto.entityId);

    if (dto.resourceId) {
      const resource = await this.prisma.client.clinicResource.findUnique({ where: { id: dto.resourceId } });
      if (!resource || resource.entityId !== dto.entityId) throw new BadRequestException("Resource does not belong to this entity");
    }
    if (dto.doctorId) {
      const assignment = await this.prisma.client.doctorEntityAssignment.findUnique({
        where: { doctorId_entityId: { doctorId: dto.doctorId, entityId: dto.entityId } },
      });
      if (!assignment) throw new BadRequestException("Doctor is not assigned to this entity");
    }

    const updated = await this.prisma.client.visit.update({
      where: { id },
      data: { doctorId: dto.doctorId, resourceId: dto.resourceId },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "visit.assigned",
      resourceType: "visit",
      resourceId: id,
      after: { doctorId: dto.doctorId, resourceId: dto.resourceId },
    });
    return updated;
  }

  async getOne(id: string, entityId: string) {
    const visit = await this.prisma.client.visit.findFirst({
      where: { id, entityId },
      include: {
        patient: true,
        doctor: { select: { id: true, fullName: true } },
        resource: { select: { id: true, type: true, number: true, label: true } },
        appointment: true,
      },
    });
    if (!visit) throw new NotFoundException("Visit not found for this entity");
    return visit;
  }

  async updateClinical(id: string, dto: UpdateVisitClinicalDto, actorUserId: string) {
    await this.getOwn(id, dto.entityId);
    const updated = await this.prisma.client.visit.update({
      where: { id },
      data: {
        chiefComplaint: dto.chiefComplaint,
        clinicalFindings: dto.clinicalFindings,
        diagnosisSummary: dto.diagnosisSummary,
        treatmentAdvice: dto.treatmentAdvice,
        nextAppointmentRecommendedAt: dto.nextAppointmentRecommendedAt ? new Date(dto.nextAppointmentRecommendedAt) : undefined,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "visit.clinical_updated",
      resourceType: "visit",
      resourceId: id,
    });
    return updated;
  }
}
