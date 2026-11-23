import { Controller, Get, Query } from "@nestjs/common";
import { PERMISSIONS } from "@rhcm/shared";
import { ReportsService } from "./reports.service";
import { RequireGlobalPermissions, RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

type ReportFn = (entityId: string, range: { from?: string; to?: string }) => Promise<unknown>;

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** Unions the per-entity report across every entity the caller holds report.read on — never a single unscoped query. */
  private async crossEntity(user: AuthenticatedUser, from: string | undefined, to: string | undefined, fn: ReportFn) {
    const grants = user.access.filter((g) => g.permissions.has(PERMISSIONS.REPORT_READ));
    const rows = await Promise.all(
      grants.map(async (g) => ({ entityId: g.entityId, entityCode: g.entityCode, ...((await fn(g.entityId, { from, to })) as object) })),
    );
    return rows;
  }

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get("collections")
  collections(@Query("entityId") entityId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.collections(entityId, { from, to });
  }

  @RequireGlobalPermissions(PERMISSIONS.REPORT_CROSS_ENTITY)
  @Get("collections/cross-entity")
  collectionsCrossEntity(@CurrentUser() user: AuthenticatedUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.crossEntity(user, from, to, (entityId, range) => this.reportsService.collections(entityId, range));
  }

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get("outstanding-balances")
  outstandingBalances(@Query("entityId") entityId: string) {
    return this.reportsService.outstandingBalances(entityId);
  }

  @RequireGlobalPermissions(PERMISSIONS.REPORT_CROSS_ENTITY)
  @Get("outstanding-balances/cross-entity")
  outstandingBalancesCrossEntity(@CurrentUser() user: AuthenticatedUser) {
    return this.crossEntity(user, undefined, undefined, (entityId) => this.reportsService.outstandingBalances(entityId));
  }

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get("doctor-production")
  doctorProduction(@Query("entityId") entityId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.doctorProduction(entityId, { from, to });
  }

  @RequireGlobalPermissions(PERMISSIONS.REPORT_CROSS_ENTITY)
  @Get("doctor-production/cross-entity")
  doctorProductionCrossEntity(@CurrentUser() user: AuthenticatedUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.crossEntity(user, from, to, (entityId, range) => this.reportsService.doctorProduction(entityId, range));
  }

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get("visits")
  visits(@Query("entityId") entityId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.visitFootfall(entityId, { from, to });
  }

  @RequireGlobalPermissions(PERMISSIONS.REPORT_CROSS_ENTITY)
  @Get("visits/cross-entity")
  visitsCrossEntity(@CurrentUser() user: AuthenticatedUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.crossEntity(user, from, to, (entityId, range) => this.reportsService.visitFootfall(entityId, range));
  }
}
