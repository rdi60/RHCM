import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PERMISSION_CATALOG, type PermissionCode } from "@rhcm/shared";
import type { CreateRoleDto } from "./dto/create-role.dto";
import type { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  permissionCatalog() {
    return PERMISSION_CATALOG;
  }

  /** System role templates plus any custom roles scoped to this entity. */
  async listForEntity(entityId: string) {
    const roles = await this.prisma.client.role.findMany({
      where: { OR: [{ entityId: null }, { entityId }] },
      include: { permissions: { include: { permission: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      isSystem: r.isSystem,
      entityId: r.entityId,
      permissions: r.permissions.map((rp) => rp.permission.code),
    }));
  }

  private async resolvePermissionIds(codes: PermissionCode[]) {
    const permissions = await this.prisma.client.permission.findMany({ where: { code: { in: codes } } });
    if (permissions.length !== new Set(codes).size) {
      const found = new Set(permissions.map((p) => p.code));
      const missing = codes.filter((c) => !found.has(c));
      throw new BadRequestException(`Unknown permission code(s): ${missing.join(", ")}`);
    }
    return permissions;
  }

  async createCustomRole(dto: CreateRoleDto, actorUserId: string) {
    const existing = await this.prisma.client.role.findUnique({
      where: { entityId_name: { entityId: dto.entityId, name: dto.name } },
    });
    if (existing) throw new ConflictException(`A role named "${dto.name}" already exists for this entity`);

    let permissionCodes = dto.permissionCodes;
    if (dto.cloneFromRoleId) {
      const source = await this.prisma.client.role.findUnique({
        where: { id: dto.cloneFromRoleId },
        include: { permissions: { include: { permission: true } } },
      });
      if (!source) throw new NotFoundException("cloneFromRoleId does not exist");
      permissionCodes = [...new Set([...permissionCodes, ...source.permissions.map((p) => p.permission.code as PermissionCode)])];
    }

    const permissions = await this.resolvePermissionIds(permissionCodes);

    const role = await this.prisma.client.role.create({
      data: {
        entityId: dto.entityId,
        name: dto.name,
        isSystem: false,
        createdById: actorUserId,
        permissions: { createMany: { data: permissions.map((p) => ({ permissionId: p.id })) } },
      },
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "role.created",
      resourceType: "role",
      resourceId: role.id,
      after: { name: role.name, permissionCodes },
    });

    return role;
  }

  async updatePermissions(roleId: string, dto: UpdateRolePermissionsDto, actorUserId: string) {
    const role = await this.prisma.client.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException("Role not found");
    if (role.isSystem) throw new ForbiddenException("System role templates cannot be edited; clone it into a custom role instead");
    if (role.entityId !== dto.entityId) throw new ForbiddenException("Role does not belong to the specified entity");

    const before = role.permissions.map((p) => p.permission.code);
    const permissions = await this.resolvePermissionIds(dto.permissionCodes);

    await this.prisma.client.$transaction([
      this.prisma.client.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.client.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "role.permissions_updated",
      resourceType: "role",
      resourceId: roleId,
      before: { permissionCodes: before },
      after: { permissionCodes: dto.permissionCodes },
    });

    return this.listForEntity(dto.entityId).then((roles) => roles.find((r) => r.id === roleId));
  }
}
