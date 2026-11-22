import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ResourceType, type Prisma } from "@rhcm/database";
import type { CreateEntityDto } from "./dto/create-entity.dto";
import type { UpdateEntitySettingsDto } from "./dto/update-entity-settings.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

@Injectable()
export class EntitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Entities the caller actually has a grant on — never the full entity list. */
  listForUser(user: AuthenticatedUser) {
    const seen = new Map<string, { id: string; code: string; displayName: string; roleName: string }>();
    for (const grant of user.access) {
      if (!seen.has(grant.entityId)) {
        seen.set(grant.entityId, {
          id: grant.entityId,
          code: grant.entityCode,
          displayName: grant.entityCode,
          roleName: grant.roleName,
        });
      }
    }
    return Array.from(seen.values());
  }

  async create(dto: CreateEntityDto, actorUserId: string) {
    const existing = await this.prisma.client.entity.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Entity code ${dto.code} already exists`);

    const entity = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.entity.create({
        data: {
          code: dto.code,
          legalName: dto.legalName,
          displayName: dto.displayName,
          timezone: dto.timezone ?? "Asia/Kolkata",
          currency: dto.currency ?? "INR",
          settings: { create: {} },
        },
      });

      for (let i = 1; i <= dto.chairCount; i++) {
        await tx.clinicResource.create({
          data: { entityId: created.id, type: ResourceType.CHAIR, number: i, label: `Chair ${i}` },
        });
      }
      for (let i = 1; i <= dto.otCount; i++) {
        await tx.clinicResource.create({
          data: { entityId: created.id, type: ResourceType.OT, number: i, label: `OT ${i}` },
        });
      }
      return created;
    });

    await this.audit.record({
      actorUserId,
      entityId: entity.id,
      action: "entity.created",
      resourceType: "entity",
      resourceId: entity.id,
      after: { code: entity.code, chairCount: dto.chairCount, otCount: dto.otCount },
    });

    return entity;
  }

  async getSettings(entityId: string) {
    const settings = await this.prisma.client.entitySettings.findUnique({ where: { entityId } });
    if (!settings) throw new NotFoundException("Entity settings not found");
    return settings;
  }

  async updateSettings(entityId: string, dto: UpdateEntitySettingsDto, actorUserId: string) {
    const before = await this.getSettings(entityId);
    const updated = await this.prisma.client.entitySettings.update({
      where: { entityId },
      data: dto as Prisma.EntitySettingsUpdateInput,
    });
    await this.audit.record({
      actorUserId,
      entityId,
      action: "entity.settings_updated",
      resourceType: "entity_settings",
      resourceId: before.id,
      before,
      after: updated,
    });
    return updated;
  }

  async listResources(entityId: string) {
    return this.prisma.client.clinicResource.findMany({
      where: { entityId },
      orderBy: [{ type: "asc" }, { number: "asc" }],
    });
  }
}
