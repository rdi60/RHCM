import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PatientsService } from "../patients/patients.service";
import type { CreateConsentRecordDto } from "./dto/consent.dto";

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly patientsService: PatientsService,
  ) {}

  async listForPatient(patientId: string, entityId: string) {
    await this.patientsService.getPatient(patientId, entityId);
    return this.prisma.client.consentRecord.findMany({
      where: { patientId, entityId },
      include: { capturedBy: { select: { id: true, email: true } } },
      orderBy: [{ consentType: "asc" }, { version: "desc" }],
    });
  }

  /** Append-only, same pattern as clinical notes: a new consent capture for the same type is a new, higher-versioned row — never an overwrite of what was previously on record. */
  async create(patientId: string, dto: CreateConsentRecordDto, actorUserId: string) {
    await this.patientsService.getPatient(patientId, dto.entityId);

    const latest = await this.prisma.client.consentRecord.findFirst({
      where: { patientId, entityId: dto.entityId, consentType: dto.consentType },
      orderBy: { version: "desc" },
    });

    const record = await this.prisma.client.consentRecord.create({
      data: {
        patientId,
        entityId: dto.entityId,
        consentType: dto.consentType,
        granted: dto.granted,
        documentRef: dto.documentRef,
        capturedById: actorUserId,
        version: (latest?.version ?? 0) + 1,
      },
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "consent.recorded",
      resourceType: "consent_record",
      resourceId: record.id,
      after: { consentType: dto.consentType, granted: dto.granted, version: record.version },
    });
    return record;
  }
}
