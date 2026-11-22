import { ForbiddenException, Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MFA_MANDATORY_ROLES } from "@rhcm/shared";
import { SecretCipher } from "../common/crypto/secret-cipher";
import type { LoginDto } from "./dto/login.dto";
import type { MfaEnableDto, MfaVerifyDto } from "./dto/mfa.dto";
import type { PasswordResetDto } from "./dto/password.dto";

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly cipher: SecretCipher;
  private readonly maxFailedAttempts: number;
  private readonly lockoutMinutes: number;
  private readonly resetTokenTtlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    this.cipher = new SecretCipher(this.config.getOrThrow("MFA_ENCRYPTION_KEY"));
    this.maxFailedAttempts = Number(this.config.get("LOGIN_MAX_FAILED_ATTEMPTS") ?? 5);
    this.lockoutMinutes = Number(this.config.get("LOGIN_LOCKOUT_MINUTES") ?? 15);
    this.resetTokenTtlMinutes = Number(this.config.get("PASSWORD_RESET_TOKEN_TTL_MINUTES") ?? 30);
  }

  async login(dto: LoginDto, session: any, meta: RequestMeta) {
    const user = await this.prisma.client.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      await this.audit.record({
        action: "auth.login_failed",
        resourceType: "user",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        after: { email: dto.email, reason: "no_such_user" },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.audit.record({
        actorUserId: user.id,
        action: "auth.login_failed",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        after: { reason: "locked" },
      });
      throw new UnauthorizedException("Account is temporarily locked. Try again later.");
    }

    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordOk = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!passwordOk) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil =
        failedLoginCount >= this.maxFailedAttempts ? new Date(Date.now() + this.lockoutMinutes * 60_000) : null;

      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { failedLoginCount, lockedUntil },
      });
      await this.audit.record({
        actorUserId: user.id,
        action: "auth.login_failed",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        after: { reason: "bad_password", failedLoginCount, locked: Boolean(lockedUntil) },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    if (user.mfaEnabled) {
      session.pendingMfaUserId = user.id;
      session.userId = undefined;
      await this.audit.record({
        actorUserId: user.id,
        action: "auth.login_password_ok_mfa_pending",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      return { mfaRequired: true };
    }

    session.userId = user.id;
    session.loginAt = Date.now();
    await this.audit.record({
      actorUserId: user.id,
      action: "auth.login_success",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return { mfaRequired: false, user: { id: user.id, email: user.email } };
  }

  async verifyMfa(dto: MfaVerifyDto, session: any, meta: RequestMeta) {
    const pendingUserId: string | undefined = session.pendingMfaUserId;
    if (!pendingUserId) throw new UnauthorizedException("No pending MFA challenge");

    const user = await this.prisma.client.user.findUnique({ where: { id: pendingUserId } });
    if (!user || !user.mfaSecretEncrypted) throw new UnauthorizedException("No pending MFA challenge");

    const secret = this.cipher.decrypt(user.mfaSecretEncrypted);
    const valid = authenticator.check(dto.code, secret);

    if (!valid) {
      await this.audit.record({
        actorUserId: user.id,
        action: "auth.mfa_failed",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException("Invalid authentication code");
    }

    session.userId = user.id;
    session.pendingMfaUserId = undefined;
    session.loginAt = Date.now();
    await this.audit.record({
      actorUserId: user.id,
      action: "auth.mfa_success",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return { user: { id: user.id, email: user.email } };
  }

  async logout(session: any, meta: RequestMeta): Promise<void> {
    const userId: string | undefined = session.userId;
    if (userId) {
      await this.audit.record({
        actorUserId: userId,
        action: "auth.logout",
        resourceType: "user",
        resourceId: userId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    await new Promise<void>((resolve) => session.destroy(() => resolve()));
  }

  async setupMfa(userId: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { pendingMfaSecretEncrypted: this.cipher.encrypt(secret) },
    });
    const issuer = this.config.get("MFA_ISSUER_NAME") ?? "RHCM";
    const otpauthUrl = authenticator.keyuri(user.email, issuer, secret);
    return { secret, otpauthUrl };
  }

  async enableMfa(userId: string, dto: MfaEnableDto) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.pendingMfaSecretEncrypted) {
      throw new BadRequestException("Call /auth/mfa/setup first");
    }
    const secret = this.cipher.decrypt(user.pendingMfaSecretEncrypted);
    if (!authenticator.check(dto.code, secret)) {
      throw new UnauthorizedException("Invalid authentication code");
    }
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaSecretEncrypted: user.pendingMfaSecretEncrypted, pendingMfaSecretEncrypted: null },
    });
    await this.audit.record({ actorUserId: userId, action: "auth.mfa_enabled", resourceType: "user", resourceId: userId });
    return { mfaEnabled: true };
  }

  async disableMfa(userId: string, password: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      include: { entityAccess: { include: { role: true } } },
    });

    const passwordOk = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordOk) throw new UnauthorizedException("Incorrect password");

    const holdsMandatoryRole = user.entityAccess.some((grant) =>
      (MFA_MANDATORY_ROLES as string[]).includes(grant.role.name),
    );
    if (holdsMandatoryRole) {
      throw new ForbiddenException("MFA cannot be disabled while this account holds a role that requires it");
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecretEncrypted: null, pendingMfaSecretEncrypted: null },
    });
    await this.audit.record({ actorUserId: userId, action: "auth.mfa_disabled", resourceType: "user", resourceId: userId });
    return { mfaEnabled: false };
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    // Always the same response shape — never reveal whether the email exists.
    if (!user) return { message: "If that email exists, a reset link has been sent." };

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + this.resetTokenTtlMinutes * 60_000),
      },
    });
    await this.audit.record({ actorUserId: user.id, action: "auth.password_reset_requested", resourceType: "user", resourceId: user.id });

    // Stage 1 has no email provider wired up yet (Stage 6). Until then,
    // the token is only ever returned outside production so local/dev/
    // e2e flows can exercise reset without a mail server.
    if (process.env.NODE_ENV === "production") {
      return { message: "If that email exists, a reset link has been sent." };
    }
    return { message: "If that email exists, a reset link has been sent.", devResetToken: token };
  }

  async resetPassword(dto: PasswordResetDto) {
    const tokenHash = createHash("sha256").update(dto.token).digest("hex");
    const user = await this.prisma.client.user.findFirst({
      where: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } },
    });
    if (!user) throw new BadRequestException("Invalid or expired reset token");

    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.audit.record({ actorUserId: user.id, action: "auth.password_reset", resourceType: "user", resourceId: user.id });
    return { message: "Password has been reset." };
  }
}
