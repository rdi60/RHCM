import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  actorUserId?: string | null;
  entityId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Append-only audit trail. Never log patient-identifying or clinical
 * payload contents here beyond what before/after already capture for the
 * resource being changed — this is for admin/security/financial actions,
 * not a general request logger, and nothing here should end up in
 * application stdout/stderr logs (see docs/ARCHITECTURE.md Section 16:
 * "no patient information in application logs").
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        entityId: entry.entityId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        beforeJson: entry.before === undefined ? undefined : (entry.before as any),
        afterJson: entry.after === undefined ? undefined : (entry.after as any),
      },
    });
  }
}
