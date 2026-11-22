import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { VisitsService } from "../visits/visits.service";
import { APPOINTMENT_ALLOWED_TRANSITIONS, type AppointmentStatus } from "../appointments/appointments.service";
import { nextTempRegistrationId, nextUhid } from "@rhcm/database";
import { PERMISSIONS } from "@rhcm/shared";
import type { CreateTempRegistrationDto } from "./dto/create-temp-registration.dto";
import type { UpdateTempRegistrationDto } from "./dto/update-temp-registration.dto";
import type { CheckInDto } from "./dto/check-in.dto";
import type { UpdatePatientDto } from "./dto/update-patient.dto";

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly visitsService: VisitsService,
  ) {}

  // --- Temporary registrations ---------------------------------------------

  async createTempRegistration(dto: CreateTempRegistrationDto, actorUserId: string) {
    const tempId = await nextTempRegistrationId(this.prisma.client, dto.entityId);
    const reg = await this.prisma.client.temporaryRegistration.create({
      data: {
        tempId,
        entityId: dto.entityId,
        fullName: dto.fullName,
        phone: dto.phone,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        ageYears: dto.ageYears,
        gender: dto.gender,
        visitReason: dto.visitReason,
        preferredDoctorId: dto.preferredDoctorId,
        createdById: actorUserId,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "patient.temp_registration_created",
      resourceType: "temporary_registration",
      resourceId: reg.id,
      after: { tempId: reg.tempId, fullName: reg.fullName },
    });
    return reg;
  }

  async listTempRegistrations(entityId: string, status?: string) {
    return this.prisma.client.temporaryRegistration.findMany({
      where: { entityId, status: status as any },
      orderBy: { createdAt: "desc" },
      include: { preferredDoctor: { select: { id: true, fullName: true } } },
    });
  }

  private async getOwnTempRegistration(id: string, entityId: string) {
    const reg = await this.prisma.client.temporaryRegistration.findUnique({ where: { id } });
    if (!reg || reg.entityId !== entityId) throw new NotFoundException("Temporary registration not found for this entity");
    return reg;
  }

  async getTempRegistration(id: string, entityId: string) {
    return this.getOwnTempRegistration(id, entityId);
  }

  async updateTempRegistration(id: string, dto: UpdateTempRegistrationDto, actorUserId: string) {
    const existing = await this.getOwnTempRegistration(id, dto.entityId);
    if (existing.status !== "OPEN") throw new BadRequestException("Only an open registration can be edited");

    const updated = await this.prisma.client.temporaryRegistration.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        ageYears: dto.ageYears,
        gender: dto.gender,
        visitReason: dto.visitReason,
        preferredDoctorId: dto.preferredDoctorId,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "patient.temp_registration_updated",
      resourceType: "temporary_registration",
      resourceId: id,
    });
    return updated;
  }

  // --- Search ----------------------------------------------------------------

  /** Entity-scoped: only patients/temp regs already linked to this entity. No cross-entity visibility. */
  async searchWithinEntity(entityId: string, q: string) {
    const trimmed = q.trim();
    if (!trimmed) return { patients: [], temporaryRegistrations: [] };

    const patients = await this.prisma.client.patient.findMany({
      where: {
        entityLinks: { some: { entityId } },
        OR: [
          { uhid: { equals: trimmed, mode: "insensitive" } },
          { phone: { contains: trimmed } },
          { fullName: { contains: trimmed, mode: "insensitive" } },
        ],
      },
      take: 20,
      orderBy: { fullName: "asc" },
    });

    const temporaryRegistrations = await this.prisma.client.temporaryRegistration.findMany({
      where: {
        entityId,
        status: "OPEN",
        OR: [
          { tempId: { equals: trimmed, mode: "insensitive" } },
          { phone: { contains: trimmed } },
          { fullName: { contains: trimmed, mode: "insensitive" } },
        ],
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    });

    return { patients, temporaryRegistrations };
  }

  /** Requires PATIENT_CROSS_ENTITY_LINK — surfaces patients NOT yet linked to this entity. */
  async searchCrossEntity(entityId: string, q: string) {
    const trimmed = q.trim();
    if (!trimmed) return [];

    const patients = await this.prisma.client.patient.findMany({
      where: {
        entityLinks: { none: { entityId } },
        OR: [
          { uhid: { equals: trimmed, mode: "insensitive" } },
          { phone: { contains: trimmed } },
          { fullName: { contains: trimmed, mode: "insensitive" } },
        ],
      },
      include: { entityLinks: { include: { entity: true } } },
      take: 20,
    });

    return patients.map((p) => ({
      id: p.id,
      uhid: p.uhid,
      fullName: p.fullName,
      phone: p.phone,
      linkedEntities: p.entityLinks.map((l) => l.entity.code),
    }));
  }

  // --- Check-in ----------------------------------------------------------------

  async checkIn(tempRegId: string, dto: CheckInDto, actorUserId: string, actorHasCrossEntityPermission: boolean) {
    const reg = await this.getOwnTempRegistration(tempRegId, dto.entityId);
    if (reg.status !== "OPEN") throw new BadRequestException("This registration has already been checked in, expired, or was discarded");

    return this.prisma.client.$transaction(async (tx) => {
      let patient;

      if (dto.matchedPatientId) {
        patient = await tx.patient.findUnique({ where: { id: dto.matchedPatientId }, include: { entityLinks: true } });
        if (!patient) throw new NotFoundException("Matched patient not found");

        const hasLinkHere = patient.entityLinks.some((l) => l.entityId === dto.entityId);
        const hasLinkElsewhere = patient.entityLinks.some((l) => l.entityId !== dto.entityId);

        if (!hasLinkHere && hasLinkElsewhere) {
          if (!actorHasCrossEntityPermission) {
            throw new ForbiddenException(
              `Missing required permission(s): ${PERMISSIONS.PATIENT_CROSS_ENTITY_LINK}`,
            );
          }
          if (!dto.crossEntityConsentGranted) {
            throw new BadRequestException("Linking a patient identity across entities requires recorded consent (crossEntityConsentGranted)");
          }
          await tx.consentRecord.create({
            data: {
              patientId: patient.id,
              entityId: dto.entityId,
              consentType: "CROSS_ENTITY_IDENTITY_LINKING",
              granted: true,
              capturedById: actorUserId,
            },
          });
          await this.audit.record({
            actorUserId,
            entityId: dto.entityId,
            action: "patient.cross_entity_linked",
            resourceType: "patient",
            resourceId: patient.id,
          });
        }

        if (!hasLinkHere) {
          await tx.patientEntityLink.create({ data: { patientId: patient.id, entityId: dto.entityId } });
        }
      } else {
        const uhid = await nextUhid(tx);
        patient = await tx.patient.create({
          data: {
            uhid,
            fullName: reg.fullName,
            phone: reg.phone,
            dob: reg.dob,
            ageYears: reg.ageYears,
            gender: reg.gender,
            entityLinks: { create: { entityId: dto.entityId } },
          },
          include: { entityLinks: true },
        });
        await this.audit.record({
          actorUserId,
          entityId: dto.entityId,
          action: "patient.created",
          resourceType: "patient",
          resourceId: patient.id,
          after: { uhid: patient.uhid },
        });
      }

      const updatedReg = await tx.temporaryRegistration.update({
        where: { id: tempRegId },
        data: { status: "CHECKED_IN", matchedPatientId: patient.id },
      });

      await this.audit.record({
        actorUserId,
        entityId: dto.entityId,
        action: "patient.checked_in",
        resourceType: "temporary_registration",
        resourceId: tempRegId,
        after: { patientId: patient.id },
      });

      let doctorId: string | null = reg.preferredDoctorId;
      let resourceId: string | null = null;
      let chiefComplaint: string | null = reg.visitReason;

      if (dto.appointmentId) {
        const appointment = await tx.appointment.findUnique({ where: { id: dto.appointmentId } });
        if (!appointment || appointment.entityId !== dto.entityId) {
          throw new NotFoundException("Appointment not found for this entity");
        }
        if (appointment.temporaryRegistrationId !== tempRegId && appointment.patientId !== patient.id) {
          throw new BadRequestException("This appointment does not belong to the patient being checked in");
        }
        const allowed = APPOINTMENT_ALLOWED_TRANSITIONS[appointment.status as AppointmentStatus];
        if (!allowed.includes("CHECKED_IN")) {
          throw new BadRequestException(`Cannot check in an appointment in status ${appointment.status}`);
        }
        await tx.appointment.update({
          where: { id: dto.appointmentId },
          // Also attach the now-resolved patient: the appointment may have
          // been booked against the temporary registration only, and the
          // "exactly one of patientId/temporaryRegistrationId" CHECK
          // constraint means temporaryRegistrationId must be cleared the
          // moment patientId is set, even if it was already set before.
          data: { status: "CHECKED_IN", patientId: patient.id, temporaryRegistrationId: null },
        });
        doctorId = appointment.doctorId;
        resourceId = appointment.resourceId;
        chiefComplaint = appointment.procedureHint ?? chiefComplaint;
      }

      const visit = await this.visitsService.createForCheckIn(tx, {
        entityId: dto.entityId,
        patientId: patient.id,
        appointmentId: dto.appointmentId,
        doctorId,
        resourceId,
        chiefComplaint,
      });

      return { patient, temporaryRegistration: updatedReg, visit };
    });
  }

  // --- Patient detail ----------------------------------------------------------

  async getPatient(patientId: string, entityId: string) {
    const patient = await this.prisma.client.patient.findFirst({
      where: { id: patientId, entityLinks: { some: { entityId } } },
      include: { entityLinks: { include: { entity: true } } },
    });
    if (!patient) throw new NotFoundException("Patient not found for this entity");
    return patient;
  }

  async updatePatient(patientId: string, dto: UpdatePatientDto, actorUserId: string) {
    await this.getPatient(patientId, dto.entityId); // enforces the entity link exists

    const updated = await this.prisma.client.patient.update({
      where: { id: patientId },
      data: {
        phone: dto.phone,
        email: dto.email,
        gender: dto.gender,
        addressJson: dto.addressJson as any,
        emergencyContactJson: dto.emergencyContactJson as any,
        guardianJson: dto.guardianJson as any,
        medicalAlertsJson: dto.medicalAlertsJson as any,
        allergiesJson: dto.allergiesJson as any,
        medicalHistoryJson: dto.medicalHistoryJson as any,
      },
    });
    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "patient.updated",
      resourceType: "patient",
      resourceId: patientId,
    });
    return updated;
  }
}
