import { SYSTEM_ROLES, type SystemRoleName } from "./roles";

/** Roles that must have MFA enabled before they can be granted entity access. */
export const MFA_MANDATORY_ROLES: SystemRoleName[] = [
  SYSTEM_ROLES.SUPER_ADMIN,
  SYSTEM_ROLES.CLINIC_ADMIN,
  SYSTEM_ROLES.TRUST_ADMIN,
  SYSTEM_ROLES.ACCOUNTANT,
];
