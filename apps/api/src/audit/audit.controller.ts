import { Controller, Get, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { addMinutes, istToUtc } from "../common/time/ist";

@Controller("audit-logs")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions(PERMISSIONS.AUDIT_LOG_READ)
  @Get()
  list(
    @Query("entityId") entityId: string,
    @Query("take") take?: string,
    @Query("action") action?: string,
    @Query("resourceType") resourceType?: string,
    @Query("actorUserId") actorUserId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const where: any = { entityId };
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (resourceType) where.resourceType = resourceType;
    if (actorUserId) where.actorUserId = actorUserId;
    if (from || to) {
      where.occurredAt = {};
      if (from) where.occurredAt.gte = istToUtc(from, "00:00");
      if (to) where.occurredAt.lt = addMinutes(istToUtc(to, "00:00"), 24 * 60);
    }

    return this.prisma.client.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, email: true } } },
      orderBy: { occurredAt: "desc" },
      take: Math.min(Number(take) || 100, 500),
    });
  }
}
