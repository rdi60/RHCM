import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { prisma } from "@rhcm/database";
import { createTestApp, extractCookie, loginWithMfa } from "./test-app";

const DEV_PASSWORD = "DevPass!2026";
const DEV_MFA_SECRET = "JBSWY3DPEHPK3PXP";

describe("Auth + RBAC (Stage 1)", () => {
  let app: INestApplication;
  let server: any;
  let clinicId: string;
  let trustId: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();

    const clinic = await prisma.entity.findUniqueOrThrow({ where: { code: "CLINIC" } });
    const trust = await prisma.entity.findUniqueOrThrow({ where: { code: "TRUST" } });
    clinicId = clinic.id;
    trustId = trust.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function loginAsReceptionist() {
    const res = await request(server)
      .post("/auth/login")
      .send({ email: "receptionist@rhcm.test", password: DEV_PASSWORD })
      .expect(200);
    expect(res.body).toEqual({ mfaRequired: false, user: expect.any(Object) });
    return extractCookie(res);
  }

  async function loginAsSuperAdmin() {
    return loginWithMfa(server, "superadmin@rhcm.test", DEV_PASSWORD);
  }

  describe("unauthenticated access", () => {
    it("rejects a protected route with no session", async () => {
      await request(server).get("/auth/me").expect(401);
    });
  });

  describe("login", () => {
    it("rejects an unknown email with a generic message (no user enumeration)", async () => {
      const res = await request(server).post("/auth/login").send({ email: "nobody@rhcm.test", password: "whatever12345" }).expect(401);
      expect(res.body.message).toBe("Invalid email or password");
    });

    it("rejects a wrong password with the same generic message", async () => {
      const res = await request(server)
        .post("/auth/login")
        .send({ email: "receptionist@rhcm.test", password: "wrong-password" })
        .expect(401);
      expect(res.body.message).toBe("Invalid email or password");
    });

    it("locks the account after repeated failed attempts", async () => {
      const email = "nurse@rhcm.test";
      for (let i = 0; i < 5; i++) {
        await request(server).post("/auth/login").send({ email, password: "wrong-password" });
      }
      const res = await request(server).post("/auth/login").send({ email, password: DEV_PASSWORD }).expect(401);
      expect(res.body.message).toMatch(/locked/i);

      // nurse@rhcm.test is a shared fixture other spec files log in as —
      // unlock it again so this test's side effect doesn't leak into them.
      await prisma.user.update({ where: { email }, data: { failedLoginCount: 0, lockedUntil: null } });
    });

    it("logs in a non-MFA user directly", async () => {
      const cookie = await loginAsReceptionist();
      const me = await request(server).get("/auth/me").set("Cookie", cookie).expect(200);
      expect(me.body.email).toBe("receptionist@rhcm.test");
    });

    it("requires MFA for an MFA-enabled user and rejects access before it's verified", async () => {
      await prisma.user.updateMany({ where: { email: "superadmin@rhcm.test" }, data: { lastMfaStep: null } });

      const loginRes = await request(server)
        .post("/auth/login")
        .send({ email: "superadmin@rhcm.test", password: DEV_PASSWORD })
        .expect(200);
      expect(loginRes.body.mfaRequired).toBe(true);
      const pendingCookie = extractCookie(loginRes);

      await request(server).get("/auth/me").set("Cookie", pendingCookie).expect(401);

      await request(server).post("/auth/mfa/verify").set("Cookie", pendingCookie).send({ code: "000000" }).expect(401);

      const code = authenticator.generate(DEV_MFA_SECRET);
      await request(server).post("/auth/mfa/verify").set("Cookie", pendingCookie).send({ code }).expect(200);
    });

    it("rejects a second use of the same TOTP code (replay protection)", async () => {
      await prisma.user.updateMany({ where: { email: "superadmin@rhcm.test" }, data: { lastMfaStep: null } });

      const loginRes = await request(server)
        .post("/auth/login")
        .send({ email: "superadmin@rhcm.test", password: DEV_PASSWORD })
        .expect(200);
      const firstPendingCookie = extractCookie(loginRes);
      const code = authenticator.generate(DEV_MFA_SECRET);
      await request(server).post("/auth/mfa/verify").set("Cookie", firstPendingCookie).send({ code }).expect(200);

      // A second, independent login attempt presenting the exact same code
      // (e.g. an attacker who captured it) must be rejected even though the
      // code itself is well-formed and matches the secret.
      const secondLoginRes = await request(server)
        .post("/auth/login")
        .send({ email: "superadmin@rhcm.test", password: DEV_PASSWORD })
        .expect(200);
      const secondPendingCookie = extractCookie(secondLoginRes);
      const res = await request(server)
        .post("/auth/mfa/verify")
        .set("Cookie", secondPendingCookie)
        .send({ code })
        .expect(401);
      expect(res.body.message).toBe("Invalid authentication code");
    });
  });

  describe("permission enforcement", () => {
    it("denies a receptionist (no USER_MANAGE) from listing users", async () => {
      const cookie = await loginAsReceptionist();
      const res = await request(server).get(`/users?entityId=${clinicId}`).set("Cookie", cookie).expect(403);
      expect(res.body.message).toMatch(/user.manage/);
    });

    it("denies a receptionist from reading entity settings", async () => {
      const cookie = await loginAsReceptionist();
      await request(server).get(`/entities/${clinicId}/settings`).set("Cookie", cookie).expect(403);
    });

    it("allows a super administrator to list users at an entity they have access to", async () => {
      const cookie = await loginAsSuperAdmin();
      const res = await request(server).get(`/users?entityId=${clinicId}`).set("Cookie", cookie).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe("entity isolation", () => {
    it("rejects a request scoped to an entity the caller has no grant for", async () => {
      const cookie = await loginAsReceptionist(); // Clinic-only
      const res = await request(server).get(`/users?entityId=${trustId}`).set("Cookie", cookie).expect(403);
      expect(res.body.message).toMatch(/No access to this entity/);
    });

    it("lets a super administrator (access to both) read Trust data", async () => {
      const cookie = await loginAsSuperAdmin();
      await request(server).get(`/users?entityId=${trustId}`).set("Cookie", cookie).expect(200);
    });
  });

  describe("MFA-mandatory role enforcement", () => {
    it("refuses to grant an MFA-mandatory role to a user without MFA enabled", async () => {
      const cookie = await loginAsSuperAdmin();

      const newUserRes = await request(server)
        .post("/users")
        .set("Cookie", cookie)
        .send({ email: `candidate-${Date.now()}@rhcm.test` })
        .expect(201);

      const accountantRole = await prisma.role.findFirstOrThrow({ where: { name: "Accountant", isSystem: true } });

      const res = await request(server)
        .post(`/users/${newUserRes.body.id}/access`)
        .set("Cookie", cookie)
        .send({ entityId: clinicId, roleId: accountantRole.id })
        .expect(403);
      expect(res.body.message).toMatch(/multi-factor authentication/i);
    });
  });

  describe("custom roles", () => {
    it("creates a custom role scoped to one entity and updates its permissions", async () => {
      const cookie = await loginAsSuperAdmin();

      const createRes = await request(server)
        .post("/roles")
        .set("Cookie", cookie)
        .send({ entityId: clinicId, name: `Front Desk Lead ${Date.now()}`, permissionCodes: ["patient.read"] })
        .expect(201);

      const updateRes = await request(server)
        .patch(`/roles/${createRes.body.id}/permissions`)
        .set("Cookie", cookie)
        .send({ entityId: clinicId, permissionCodes: ["patient.read", "patient.register"] })
        .expect(200);
      expect(updateRes.body.permissions.sort()).toEqual(["patient.read", "patient.register"].sort());
    });

    it("refuses to edit a system role template", async () => {
      const cookie = await loginAsSuperAdmin();
      const receptionistRole = await prisma.role.findFirstOrThrow({ where: { name: "Receptionist", isSystem: true } });

      await request(server)
        .patch(`/roles/${receptionistRole.id}/permissions`)
        .set("Cookie", cookie)
        .send({ entityId: clinicId, permissionCodes: ["patient.read"] })
        .expect(403);
    });
  });

  describe("password reset", () => {
    it("completes the forgot -> reset -> login-with-new-password cycle", async () => {
      const forgotRes = await request(server).post("/auth/password/forgot").send({ email: "billing@rhcm.test" }).expect(200);
      expect(forgotRes.body.devResetToken).toBeTruthy();

      const newPassword = "A-Brand-New-Password-123";
      await request(server)
        .post("/auth/password/reset")
        .send({ token: forgotRes.body.devResetToken, newPassword })
        .expect(200);

      await request(server).post("/auth/login").send({ email: "billing@rhcm.test", password: DEV_PASSWORD }).expect(401);
      await request(server).post("/auth/login").send({ email: "billing@rhcm.test", password: newPassword }).expect(200);

      // billing@rhcm.test is a shared fixture other spec files log in with
      // DEV_PASSWORD — restore it so this test's side effect doesn't leak.
      const restoredHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
      await prisma.user.update({ where: { email: "billing@rhcm.test" }, data: { passwordHash: restoredHash } });
    });

    it("rejects a reused or invalid reset token", async () => {
      await request(server).post("/auth/password/reset").send({ token: "not-a-real-token", newPassword: "Whatever-123456" }).expect(400);
    });
  });

  describe("doctor management", () => {
    it("creates a doctor assigned to one entity and replaces their availability", async () => {
      const cookie = await loginAsSuperAdmin();

      const createRes = await request(server)
        .post("/doctors")
        .set("Cookie", cookie)
        .send({ entityId: clinicId, fullName: "Dr. Test E2E", registrationNumber: `DCI-E2E-${Date.now()}` })
        .expect(201);

      const availRes = await request(server)
        .put(`/doctors/${createRes.body.id}/availability`)
        .set("Cookie", cookie)
        .send({
          entityId: clinicId,
          slots: [{ weekday: 2, startTime: "10:00", endTime: "16:00", effectiveFrom: "2026-01-01" }],
        })
        .expect(200);
      expect(availRes.body).toHaveLength(1);

      const list = await request(server).get(`/doctors?entityId=${clinicId}`).set("Cookie", cookie).expect(200);
      expect(list.body.some((d: any) => d.id === createRes.body.id)).toBe(true);
    });
  });
});
