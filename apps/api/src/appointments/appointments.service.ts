import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PERMISSIONS } from "@rhcm/shared";
import type { CreateAppointmentDto } from "./dto/create-appointment.dto";
import type { UpdateAppointmentStatusDto } from "./dto/update-status.dto";
import type { RescheduleAppointmentDto } from "./dto/reschedule.dto";
import { istToUtc, istWeekday, addMinutes } from "../common/time/ist";

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

/**
 * Pre-Completed states can still move to Cancelled/No Show; everything
 * past Completed (and the other terminal states) has no way out. The
 * database's exclusion constraints are the real conflict guarantee —
 * this table only governs the *workflow*, not booking safety.
 */
export const APPOINTMENT_ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  // CHECKED_IN is reachable directly from BOOKED/CONFIRMED too: the Stage 2
  // check-in action marks a patient both arrived and checked in as one
  // reception step, rather than forcing two separate status updates.
  BOOKED: ["CONFIRMED", "ARRIVED", "CHECKED_IN", "CANCELLED", "NO_SHOW", "RESCHEDULED"],
  CONFIRMED: ["ARRIVED", "CHECKED_IN", "CANCELLED", "NO_SHOW", "RESCHEDULED"],
  ARRIVED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["WAITING", "CANCELLED"],
  WAITING: ["IN_TREATMENT", "CANCELLED"],
  IN_TREATMENT: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  RESCHEDULED: [],
};

function isConflictError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("appointments_doctor_no_overlap") ||
    message.includes("appointments_resource_no_overlap") ||
    message.includes("exclusion constraint")
  );
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateAppointmentDto, actorUserId: string, actorPermissions: Set<string>) {
    const [doctorAssignment, resource] = await Promise.all([
      this.prisma.client.doctorEntityAssignment.findUnique({
        where: { doctorId_entityId: { doctorId: dto.doctorId, entityId: dto.entityId } },
      }),
      dto.resourceId ? this.prisma.client.clinicResource.findUnique({ where: { id: dto.resourceId } }) : null,
    ]);
    if (!doctorAssignment) throw new BadRequestException("Doctor is not assigned to this entity");
    if (dto.resourceId && (!resource || resource.entityId !== dto.entityId)) {
      throw new BadRequestException("Resource does not belong to this entity");
    }

    if (dto.patientId) {
      const link = await this.prisma.client.patientEntityLink.findUnique({
        where: { patientId_entityId: { patientId: dto.patientId, entityId: dto.entityId } },
      });
      if (!link) throw new BadRequestException("Patient is not registered at this entity");
    } else if (dto.temporaryRegistrationId) {
      const reg = await this.prisma.client.temporaryRegistration.findUnique({ where: { id: dto.temporaryRegistrationId } });
      if (!reg || reg.entityId !== dto.entityId) throw new BadRequestException("Temporary registration not found for this entity");
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new BadRequestException("endAt must be after startAt");

    let isEmergencyOverride = false;
    if (dto.overrideConflict) {
      if (dto.type !== "EMERGENCY") {
        throw new BadRequestException("overrideConflict can only be used with an EMERGENCY appointment type");
      }
      if (!actorPermissions.has(PERMISSIONS.APPOINTMENT_OVERRIDE_CONFLICT)) {
        throw new ForbiddenException(`Missing required permission(s): ${PERMISSIONS.APPOINTMENT_OVERRIDE_CONFLICT}`);
      }
      isEmergencyOverride = true;
    }

    try {
      const appointment = await this.prisma.client.appointment.create({
        data: {
          entityId: dto.entityId,
          patientId: dto.patientId,
          temporaryRegistrationId: dto.temporaryRegistrationId,
          doctorId: dto.doctorId,
          resourceId: dto.resourceId,
          startAt,
          endAt,
          type: dto.type ?? "CONSULTATION",
          procedureHint: dto.procedureHint,
          remarks: dto.remarks,
          isEmergencyOverride,
          createdById: actorUserId,
        },
      });

      await this.audit.record({
        actorUserId,
        entityId: dto.entityId,
        action: "appointment.booked",
        resourceType: "appointment",
        resourceId: appointment.id,
        after: { startAt: dto.startAt, endAt: dto.endAt, doctorId: dto.doctorId, resourceId: dto.resourceId },
      });

      return appointment;
    } catch (err) {
      if (isConflictError(err)) {
        throw new ConflictException("This doctor or resource is no longer available for the requested time");
      }
      throw err;
    }
  }

  async listForRange(params: {
    entityId: string;
    from?: string;
    to?: string;
    doctorId?: string;
    resourceId?: string;
    status?: string;
    patientId?: string;
  }) {
    return this.prisma.client.appointment.findMany({
      where: {
        entityId: params.entityId,
        startAt: params.from ? { gte: new Date(params.from) } : undefined,
        endAt: params.to ? { lte: new Date(params.to) } : undefined,
        doctorId: params.doctorId,
        resourceId: params.resourceId,
        status: params.status as any,
        patientId: params.patientId,
      },
      include: {
        patient: { select: { id: true, fullName: true, uhid: true } },
        temporaryRegistration: { select: { id: true, fullName: true, tempId: true } },
        doctor: { select: { id: true, fullName: true } },
        resource: { select: { id: true, type: true, number: true, label: true } },
      },
      orderBy: { startAt: "asc" },
    });
  }

  /** Live (not cancelled/completed/rescheduled-away) appointments booked against a temp registration — used by the check-in screen to offer "confirm this appointment" instead of a bare walk-in. */
  async listForTempRegistration(entityId: string, temporaryRegistrationId: string) {
    return this.prisma.client.appointment.findMany({
      where: {
        entityId,
        temporaryRegistrationId,
        status: { in: ["BOOKED", "CONFIRMED", "ARRIVED"] },
      },
      include: {
        doctor: { select: { id: true, fullName: true } },
        resource: { select: { id: true, type: true, number: true, label: true } },
      },
      orderBy: { startAt: "asc" },
    });
  }

  async getOne(id: string, entityId: string) {
    const appt = await this.prisma.client.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, fullName: true, uhid: true, phone: true } },
        temporaryRegistration: { select: { id: true, fullName: true, tempId: true, phone: true } },
        doctor: { select: { id: true, fullName: true } },
        resource: { select: { id: true, type: true, number: true, label: true } },
      },
    });
    if (!appt || appt.entityId !== entityId) throw new NotFoundException("Appointment not found for this entity");
    return appt;
  }

  async updateStatus(id: string, dto: UpdateAppointmentStatusDto, actorUserId: string) {
    const appt = await this.getOne(id, dto.entityId);
    const allowed = APPOINTMENT_ALLOWED_TRANSITIONS[appt.status as AppointmentStatus];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot move an appointment from ${appt.status} to ${dto.status}`);
    }

    const updated = await this.prisma.client.appointment.update({ where: { id }, data: { status: dto.status } });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "appointment.status_changed",
      resourceType: "appointment",
      resourceId: id,
      before: { status: appt.status },
      after: { status: dto.status },
    });
    return updated;
  }

  async reschedule(id: string, dto: RescheduleAppointmentDto, actorUserId: string) {
    const original = await this.getOne(id, dto.entityId);
    if (!APPOINTMENT_ALLOWED_TRANSITIONS[original.status as AppointmentStatus].includes("RESCHEDULED")) {
      throw new BadRequestException(`An appointment in status ${original.status} cannot be rescheduled`);
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new BadRequestException("endAt must be after startAt");

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await tx.appointment.update({ where: { id }, data: { status: "RESCHEDULED" } });
        const next = await tx.appointment.create({
          data: {
            entityId: original.entityId,
            patientId: original.patientId,
            temporaryRegistrationId: original.temporaryRegistrationId,
            doctorId: original.doctorId,
            resourceId: dto.resourceId ?? original.resourceId,
            startAt,
            endAt,
            type: original.type,
            procedureHint: original.procedureHint,
            remarks: original.remarks,
            rescheduledFromId: id,
            createdById: actorUserId,
          },
        });
        return next;
      });
    } catch (err) {
      if (isConflictError(err)) {
        throw new ConflictException("The new time is no longer available for this doctor or resource");
      }
      throw err;
    }
  }

  /**
   * Generates this doctor's bookable slots for one IST calendar date from
   * their recurring availability, minus leave, minus already-booked
   * (live-status) appointments. A convenience/UX endpoint — the database
   * exclusion constraints remain the actual safety net on booking.
   */
  async getAvailability(entityId: string, doctorId: string, dateYYYYMMDD: string) {
    const dayStart = istToUtc(dateYYYYMMDD, "00:00");
    const weekday = istWeekday(dayStart);

    const [availabilityRows, leaveRows, existingAppointments] = await Promise.all([
      this.prisma.client.doctorAvailability.findMany({
        where: {
          doctorId,
          entityId,
          weekday,
          effectiveFrom: { lte: dayStart },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: dayStart } }],
        },
      }),
      this.prisma.client.doctorLeave.findMany({
        where: { doctorId, entityId, dateFrom: { lte: dayStart }, dateTo: { gte: dayStart } },
      }),
      this.prisma.client.appointment.findMany({
        where: {
          doctorId,
          entityId,
          status: { notIn: ["CANCELLED", "NO_SHOW", "RESCHEDULED"] },
          startAt: { lt: addMinutes(dayStart, 24 * 60) },
          endAt: { gt: dayStart },
        },
        select: { startAt: true, endAt: true },
      }),
    ]);

    if (leaveRows.length > 0) {
      return { onLeave: true, slots: [] };
    }

    const slots: { startAt: string; endAt: string; available: boolean }[] = [];
    for (const row of availabilityRows) {
      let cursor = istToUtc(dateYYYYMMDD, row.startTime);
      const end = istToUtc(dateYYYYMMDD, row.endTime);
      const breakStart = row.breakStart ? istToUtc(dateYYYYMMDD, row.breakStart) : null;
      const breakEnd = row.breakEnd ? istToUtc(dateYYYYMMDD, row.breakEnd) : null;

      while (addMinutes(cursor, row.slotDurationMinutes) <= end) {
        const slotStart = cursor;
        const slotEnd = addMinutes(cursor, row.slotDurationMinutes);
        const duringBreak = breakStart && breakEnd && slotStart < breakEnd && slotEnd > breakStart;
        const overlapsExisting = existingAppointments.some((a) => slotStart < a.endAt && slotEnd > a.startAt);

        slots.push({
          startAt: slotStart.toISOString(),
          endAt: slotEnd.toISOString(),
          available: !duringBreak && !overlapsExisting,
        });
        cursor = slotEnd;
      }
    }

    return { onLeave: false, slots };
  }
}
