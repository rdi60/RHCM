import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateDoctorDto } from "./dto/create-doctor.dto";
import type { ReplaceAvailabilityDto, CreateDoctorLeaveDto } from "./dto/availability.dto";

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForEntity(entityId: string) {
    const doctors = await this.prisma.client.doctor.findMany({
      where: { assignments: { some: { entityId } } },
      orderBy: { fullName: "asc" },
    });
    return doctors;
  }

  /** Minimal, low-sensitivity fields for pick-a-doctor dropdowns (registration, scheduling) — not the admin management list. */
  async directory(entityId: string) {
    return this.prisma.client.doctor.findMany({
      where: { assignments: { some: { entityId } }, isActive: true },
      select: { id: true, fullName: true, specialtiesJson: true },
      orderBy: { fullName: "asc" },
    });
  }

  async create(dto: CreateDoctorDto, actorUserId: string) {
    const existing = await this.prisma.client.doctor.findUnique({ where: { registrationNumber: dto.registrationNumber } });
    if (existing) throw new ConflictException("A doctor with this registration number already exists");

    const doctor = await this.prisma.client.doctor.create({
      data: {
        fullName: dto.fullName,
        registrationNumber: dto.registrationNumber,
        qualificationsJson: dto.qualifications ?? [],
        specialtiesJson: dto.specialties ?? [],
        defaultConsultationFee: dto.defaultConsultationFee ?? 0,
        userId: dto.userId,
        assignments: { create: { entityId: dto.entityId } },
      },
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "doctor.created",
      resourceType: "doctor",
      resourceId: doctor.id,
      after: { fullName: doctor.fullName, registrationNumber: doctor.registrationNumber },
    });

    return doctor;
  }

  async assign(doctorId: string, entityId: string, actorUserId: string) {
    const doctor = await this.prisma.client.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException("Doctor not found");

    const assignment = await this.prisma.client.doctorEntityAssignment.upsert({
      where: { doctorId_entityId: { doctorId, entityId } },
      update: {},
      create: { doctorId, entityId },
    });
    await this.audit.record({ actorUserId, entityId, action: "doctor.assigned", resourceType: "doctor", resourceId: doctorId });
    return assignment;
  }

  async unassign(doctorId: string, entityId: string, actorUserId: string) {
    await this.prisma.client.doctorEntityAssignment.deleteMany({ where: { doctorId, entityId } });
    await this.audit.record({ actorUserId, entityId, action: "doctor.unassigned", resourceType: "doctor", resourceId: doctorId });
    return { success: true };
  }

  async getAvailability(doctorId: string, entityId: string) {
    return this.prisma.client.doctorAvailability.findMany({
      where: { doctorId, entityId },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });
  }

  /** Full replace, inside one transaction, so a partial update never leaves a doctor's week half-edited. */
  async replaceAvailability(doctorId: string, dto: ReplaceAvailabilityDto, actorUserId: string) {
    const doctor = await this.prisma.client.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException("Doctor not found");

    await this.prisma.client.$transaction([
      this.prisma.client.doctorAvailability.deleteMany({ where: { doctorId, entityId: dto.entityId } }),
      this.prisma.client.doctorAvailability.createMany({
        data: dto.slots.map((slot) => ({
          doctorId,
          entityId: dto.entityId,
          weekday: slot.weekday,
          startTime: slot.startTime,
          endTime: slot.endTime,
          breakStart: slot.breakStart,
          breakEnd: slot.breakEnd,
          slotDurationMinutes: slot.slotDurationMinutes ?? 15,
          effectiveFrom: new Date(slot.effectiveFrom),
          effectiveTo: slot.effectiveTo ? new Date(slot.effectiveTo) : null,
        })),
      }),
    ]);

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "doctor.availability_replaced",
      resourceType: "doctor",
      resourceId: doctorId,
      after: { slotCount: dto.slots.length },
    });

    return this.getAvailability(doctorId, dto.entityId);
  }

  async listLeave(doctorId: string, entityId: string) {
    return this.prisma.client.doctorLeave.findMany({ where: { doctorId, entityId }, orderBy: { dateFrom: "desc" } });
  }

  async createLeave(doctorId: string, dto: CreateDoctorLeaveDto, actorUserId: string) {
    const doctor = await this.prisma.client.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException("Doctor not found");

    const leave = await this.prisma.client.doctorLeave.create({
      data: {
        doctorId,
        entityId: dto.entityId,
        dateFrom: new Date(dto.dateFrom),
        dateTo: new Date(dto.dateTo),
        reason: dto.reason,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "doctor.leave_created",
      resourceType: "doctor_leave",
      resourceId: leave.id,
      after: { dateFrom: dto.dateFrom, dateTo: dto.dateTo },
    });
    return leave;
  }
}
