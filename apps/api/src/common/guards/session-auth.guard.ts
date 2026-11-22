import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser, EntityAccessGrant } from "../types/authenticated-user";

/**
 * Loads the session's user (if any) and resolves their current
 * entity/role/permission grants fresh from the database on every request
 * — permission changes take effect immediately, rather than being cached
 * in a long-lived token. Rejects with 401 unless the route is @Public().
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.session?.userId;

    if (!userId) {
      if (isPublic) return true;
      throw new UnauthorizedException("Not authenticated");
    }

    const absoluteTimeoutHours = Number(this.config.get("SESSION_ABSOLUTE_TIMEOUT_HOURS") ?? 12);
    const loginAt: number | undefined = request.session?.loginAt;
    if (loginAt && Date.now() - loginAt > absoluteTimeoutHours * 60 * 60 * 1000) {
      request.session.destroy(() => undefined);
      if (isPublic) return true;
      throw new UnauthorizedException("Session expired, please log in again");
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: {
        entityAccess: {
          include: {
            entity: true,
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    if (!user || user.status !== "ACTIVE") {
      // Session points at a user that no longer exists or was disabled.
      request.session.destroy(() => undefined);
      throw new UnauthorizedException("Session is no longer valid");
    }

    const access: EntityAccessGrant[] = user.entityAccess.map((grant) => ({
      entityId: grant.entityId,
      entityCode: grant.entity.code,
      roleId: grant.roleId,
      roleName: grant.role.name,
      permissions: new Set(grant.role.permissions.map((rp) => rp.permission.code)),
    }));

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      mfaEnabled: user.mfaEnabled,
      access,
    };

    request.authUser = authUser;
    return true;
  }
}
