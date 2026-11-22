import { SetMetadata } from "@nestjs/common";
import type { PermissionCode } from "@rhcm/shared";

export const ENTITY_PERMISSIONS_KEY = "entityPermissions";
export const GLOBAL_PERMISSIONS_KEY = "globalPermissions";
export const SELF_SERVICE_KEY = "selfService";

/**
 * Requires the caller to hold ALL of these permissions within the entity
 * resolved for this request (route param `:entityId`, or `?entityId=`
 * query string — see EntityScopeGuard). Use for anything scoped to one
 * entity's data.
 */
export const RequirePermissions = (...codes: PermissionCode[]) => SetMetadata(ENTITY_PERMISSIONS_KEY, codes);

/**
 * Requires the caller to hold ALL of these permissions in AT LEAST ONE of
 * their entity-access grants, regardless of which entity. Use only for
 * actions that are not themselves scoped to a single entity's data (e.g.
 * creating a new Entity, editing a system role template).
 */
export const RequireGlobalPermissions = (...codes: PermissionCode[]) => SetMetadata(GLOBAL_PERMISSIONS_KEY, codes);

/**
 * Requires an authenticated session but no specific permission — for
 * actions scoped to the caller's own account (view my profile, set up my
 * own MFA). Distinct from @Public(), which skips authentication entirely.
 */
export const SelfService = () => SetMetadata(SELF_SERVICE_KEY, true);
