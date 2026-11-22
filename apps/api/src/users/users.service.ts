import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MFA_MANDATORY_ROLES } from "@rhcm/shared";
import type { CreateUserDto } from "./dto/create-user.dto";
import type { GrantAccessDto } from "./dto/grant-access.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async listForEntity(entityId: string) {
    const grants = await this.prisma.client.userEntityAccess.findMany({
      where: { entityId },
      include: { user: true, role: true },
      orderBy: { grantedAt: "desc" },
    });
    return grants.map((g) => ({
      accessId: g.id,
      userId: g.userId,
      email: g.user.email,
      status: g.user.status,
      mfaEnabled: g.user.mfaEnabled,
      roleId: g.roleId,
      roleName: g.role.name,
      grantedAt: g.grantedAt,
    }));
  }

  /** Creates a user with no usable password yet; returns a one-time set-password token the admin shares out of band (Stage 6 wires this to email). */
  async create(dto: CreateUserDto, actorUserId: string) {
    const existing = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("A user with this email already exists");

    const unusablePassword = await argon2.hash(randomBytes(32).toString("hex"), { type: argon2.argon2id });
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const ttlMinutes = Number(this.config.get("PASSWORD_RESET_TOKEN_TTL_MINUTES") ?? 30) * 24 * 2; // invite link lives longer than a reset link

    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash: unusablePassword,
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    });

    await this.audit.record({ actorUserId, action: "user.created", resourceType: "user", resourceId: user.id, after: { email: user.email } });

    return { id: user.id, email: user.email, setPasswordToken: token };
  }

  async setStatus(userId: string, status: "ACTIVE" | "DISABLED", actorUserId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const updated = await this.prisma.client.user.update({ where: { id: userId }, data: { status } });
    await this.audit.record({
      actorUserId,
      action: status === "ACTIVE" ? "user.enabled" : "user.disabled",
      resourceType: "user",
      resourceId: userId,
    });
    return updated;
  }

  async grantAccess(userId: string, dto: GrantAccessDto, actorUserId: string) {
    const [user, role] = await Promise.all([
      this.prisma.client.user.findUnique({ where: { id: userId } }),
      this.prisma.client.role.findUnique({ where: { id: dto.roleId } }),
    ]);
    if (!user) throw new NotFoundException("User not found");
    if (!role) throw new NotFoundException("Role not found");
    if (role.entityId && role.entityId !== dto.entityId) {
      throw new BadRequestException("Role does not belong to the specified entity");
    }

    if ((MFA_MANDATORY_ROLES as string[]).includes(role.name) && !user.mfaEnabled) {
      throw new ForbiddenException(
        `${role.name} requires multi-factor authentication to be enabled on the account before it can be granted`,
      );
    }

    const grant = await this.prisma.client.userEntityAccess.upsert({
      where: { userId_entityId_roleId: { userId, entityId: dto.entityId, roleId: dto.roleId } },
      update: {},
      create: { userId, entityId: dto.entityId, roleId: dto.roleId, grantedById: actorUserId },
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "user.access_granted",
      resourceType: "user_entity_access",
      resourceId: grant.id,
      after: { userId, roleId: dto.roleId, roleName: role.name },
    });

    return grant;
  }

  async revokeAccess(accessId: string, entityId: string, actorUserId: string) {
    const grant = await this.prisma.client.userEntityAccess.findUnique({ where: { id: accessId } });
    if (!grant || grant.entityId !== entityId) throw new NotFoundException("Access grant not found for this entity");

    await this.prisma.client.userEntityAccess.delete({ where: { id: accessId } });
    await this.audit.record({
      actorUserId,
      entityId,
      action: "user.access_revoked",
      resourceType: "user_entity_access",
      resourceId: accessId,
      before: { userId: grant.userId, roleId: grant.roleId },
    });
    return { success: true };
  }
}
