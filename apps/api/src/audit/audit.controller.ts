import { Controller, Get, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";

@Controller("audit-logs")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions(PERMISSIONS.AUDIT_LOG_READ)
  @Get()
  list(@Query("entityId") entityId: string, @Query("take") take?: string) {
    return this.prisma.client.auditLog.findMany({
      where: { entityId },
      orderBy: { occurredAt: "desc" },
      take: Math.min(Number(take) || 100, 500),
    });
  }
}
