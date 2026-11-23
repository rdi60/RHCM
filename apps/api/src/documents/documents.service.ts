import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PatientsService } from "../patients/patients.service";
import { StorageService } from "../storage/storage.service";
import type { RequestDocumentUploadDto } from "./dto/document.dto";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly patientsService: PatientsService,
    private readonly storage: StorageService,
  ) {}

  private async getOwnDocument(documentId: string, entityId: string) {
    const doc = await this.prisma.client.patientDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.entityId !== entityId || doc.deletedAt) throw new NotFoundException("Document not found for this entity");
    return doc;
  }

  async listForPatient(patientId: string, entityId: string) {
    await this.patientsService.getPatient(patientId, entityId);
    return this.prisma.client.patientDocument.findMany({
      where: { patientId, entityId, deletedAt: null },
      include: { uploadedBy: { select: { id: true, email: true } } },
      orderBy: { uploadedAt: "desc" },
    });
  }

  /** Mints the storage key and a one-time presigned PUT URL; the client uploads bytes directly to storage, then calls confirmUpload. */
  async requestUpload(patientId: string, dto: RequestDocumentUploadDto, actorUserId: string) {
    const patient = await this.patientsService.getPatient(patientId, dto.entityId);
    if (dto.visitId) {
      const visit = await this.prisma.client.visit.findUnique({ where: { id: dto.visitId } });
      if (!visit || visit.entityId !== dto.entityId || visit.patientId !== patientId) {
        throw new BadRequestException("visitId does not belong to this patient/entity");
      }
    }
    if (dto.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB upload limit`);
    }

    const safeName = dto.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150) || "file";
    const storageKey = `patients/${patient.id}/${randomUUID()}-${safeName}`;

    const document = await this.prisma.client.patientDocument.create({
      data: {
        patientId,
        entityId: dto.entityId,
        visitId: dto.visitId,
        treatmentSessionId: dto.treatmentSessionId,
        category: dto.category,
        storageKey,
        originalFilename: dto.filename,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        uploadedById: actorUserId,
      },
    });
    const uploadUrl = await this.storage.getUploadUrl(storageKey, dto.mimeType);

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "document.upload_requested",
      resourceType: "patient_document",
      resourceId: document.id,
      after: { category: dto.category, filename: dto.filename, sizeBytes: dto.sizeBytes },
    });
    return { documentId: document.id, uploadUrl };
  }

  /**
   * Flips scanStatus PENDING -> CLEAN. This demo environment has no virus
   * scanner wired up, so it does that immediately on the client's say-so;
   * a real deployment would instead flip this only from an async AV-scan
   * webhook/worker (CLEAN or INFECTED/ERROR), and getDownloadUrl below
   * would still refuse to serve anything not CLEAN either way — this
   * confirm step is where that integration point belongs.
   */
  async confirmUpload(documentId: string, entityId: string, actorUserId: string) {
    const doc = await this.getOwnDocument(documentId, entityId);
    const updated = await this.prisma.client.patientDocument.update({ where: { id: doc.id }, data: { scanStatus: "CLEAN" } });
    await this.audit.record({ actorUserId, entityId, action: "document.upload_confirmed", resourceType: "patient_document", resourceId: doc.id });
    return updated;
  }

  /** Every download is audit-logged — who accessed this patient's document and when. */
  async getDownloadUrl(documentId: string, entityId: string, actorUserId: string) {
    const doc = await this.getOwnDocument(documentId, entityId);
    if (doc.scanStatus !== "CLEAN") {
      throw new BadRequestException(`Document is not available for download (status: ${doc.scanStatus})`);
    }
    const downloadUrl = await this.storage.getDownloadUrl(doc.storageKey, doc.originalFilename);
    await this.audit.record({ actorUserId, entityId, action: "document.downloaded", resourceType: "patient_document", resourceId: doc.id });
    return { downloadUrl };
  }

  /** Soft-delete only — the object itself is kept in storage per retention policy; nothing here purges bytes. */
  async softDelete(documentId: string, entityId: string, actorUserId: string) {
    const doc = await this.getOwnDocument(documentId, entityId);
    const updated = await this.prisma.client.patientDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    await this.audit.record({ actorUserId, entityId, action: "document.deleted", resourceType: "patient_document", resourceId: doc.id });
    return updated;
  }
}
