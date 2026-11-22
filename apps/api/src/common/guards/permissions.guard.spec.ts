import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";

function mockContext(overrides: { params?: any; query?: any; body?: any; authUser?: any } = {}) {
  const request = { params: {}, query: {}, body: {}, authUser: undefined, ...overrides };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe("PermissionsGuard", () => {
  it("fails closed when a route has neither @Public, @SelfService, @RequirePermissions nor @RequireGlobalPermissions", () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() => guard.canActivate(mockContext({ authUser: { id: "u1", access: [] } }))).toThrow(ForbiddenException);
  });

  it("denies an entity-scoped route when no entityId is resolvable", () => {
    const reflector = {
      getAllAndOverride: (key: string) => (key === "entityPermissions" ? ["patient.read"] : undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() =>
      guard.canActivate(mockContext({ authUser: { id: "u1", access: [{ entityId: "e1", permissions: new Set(["patient.read"]) }] } })),
    ).toThrow(/entityId/);
  });

  it("denies access to an entity the caller has no grant for", () => {
    const reflector = {
      getAllAndOverride: (key: string) => (key === "entityPermissions" ? ["patient.read"] : undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() =>
      guard.canActivate(
        mockContext({
          params: { entityId: "other-entity" },
          authUser: { id: "u1", access: [{ entityId: "e1", permissions: new Set(["patient.read"]) }] },
        }),
      ),
    ).toThrow(/No access to this entity/);
  });

  it("denies when the grant is missing one of several required permissions", () => {
    const reflector = {
      getAllAndOverride: (key: string) => (key === "entityPermissions" ? ["patient.read", "patient.register"] : undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() =>
      guard.canActivate(
        mockContext({
          params: { entityId: "e1" },
          authUser: { id: "u1", access: [{ entityId: "e1", permissions: new Set(["patient.read"]) }] },
        }),
      ),
    ).toThrow(/patient.register/);
  });

  it("allows when the grant holds all required permissions for the resolved entity", () => {
    const reflector = {
      getAllAndOverride: (key: string) => (key === "entityPermissions" ? ["patient.read"] : undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const ctx = mockContext({
      params: { entityId: "e1" },
      authUser: { id: "u1", access: [{ entityId: "e1", permissions: new Set(["patient.read"]) }] },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
