import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ENTITY_PERMISSIONS_KEY, GLOBAL_PERMISSIONS_KEY, SELF_SERVICE_KEY } from "../decorators/permissions.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";

function resolveRequestedEntityId(request: any): string | undefined {
  return request.params?.entityId ?? request.query?.entityId ?? request.body?.entityId;
}

/**
 * Fails closed: every route must be either @Public() or carry
 * @RequirePermissions(...) / @RequireGlobalPermissions(...). A route with
 * neither is rejected rather than silently allowed — an endpoint added
 * without thinking about authorization should break loudly in testing,
 * not leak data in production.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isSelfService = this.reflector.getAllAndOverride<boolean>(SELF_SERVICE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isSelfService) {
      const request = context.switchToHttp().getRequest();
      if (!request.authUser) throw new ForbiddenException("Not authenticated");
      return true;
    }

    const entityCodes = this.reflector.getAllAndOverride<string[]>(ENTITY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const globalCodes = this.reflector.getAllAndOverride<string[]>(GLOBAL_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!entityCodes && !globalCodes) {
      throw new ForbiddenException("Route is missing an authorization decorator");
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.authUser;
    if (!user) throw new ForbiddenException("Not authenticated");

    if (globalCodes) {
      const hasAnyGrant = user.access.some((grant) => globalCodes.every((code) => grant.permissions.has(code)));
      if (!hasAnyGrant) throw new ForbiddenException("Missing required permission");
      return true;
    }

    const entityId = resolveRequestedEntityId(request);
    if (!entityId) {
      throw new ForbiddenException("This action requires an entityId");
    }

    const grant = user.access.find((g) => g.entityId === entityId);
    if (!grant) {
      throw new ForbiddenException("No access to this entity");
    }
    const missing = entityCodes!.filter((code) => !grant.permissions.has(code));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required permission(s): ${missing.join(", ")}`);
    }

    request.entityId = entityId;
    request.entityGrant = grant;
    return true;
  }
}
