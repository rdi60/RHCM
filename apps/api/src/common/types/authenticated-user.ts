export interface EntityAccessGrant {
  entityId: string;
  entityCode: string;
  roleId: string;
  roleName: string;
  permissions: Set<string>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  mfaEnabled: boolean;
  access: EntityAccessGrant[];
}
