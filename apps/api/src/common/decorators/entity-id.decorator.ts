import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

/** The entityId resolved and authorization-checked by PermissionsGuard for this request. */
export const EntityId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().entityId;
});
