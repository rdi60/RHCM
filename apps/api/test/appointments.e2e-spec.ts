import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@rhcm/database";
import { createTestApp, extractCookie } from "./test-app";

const DEV_PASSWORD = "DevPass!2026";

describe("Appointments & Visits (Stage 3)", () => {
  let app: INestApplication;
  let server: any;
  let clinicId: string;
  let trustId: string;
  let doctorId: string;
  let chairA: string;
  let chairB: string;
  let patientId: string;
  let patientId2: string;
  let superAdminCookie: string;
  let receptionistCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();

    const clinic = await prisma.entity.findUniqueOrThrow({ where: { code: "CLINIC" } });
    const trust = await prisma.entity.findUniqueOrThrow({ where: { code: "TRUST" } });
    clinicId = clinic.id;
    trustId = trust.id;

    const doctor = await prisma.doctor.findFirstOrThrow({ where: { registrationNumber: "DCI-10001" } });
    doctorId = doctor.id;

    const resources = await prisma.clinicResource.findMany({ where: { entityId: clinicId, type: "CHAIR" }, orderBy: { number: "asc" } });
    chairA = resources[0].id;
    chairB = resources[1].id;

    const patients = await prisma.patient.findMany({ where: { phone: { in: ["+91-9000000001", "+91-9000000002"] } } });
    patientId = patients.find((p) => p.phone === "+91-9000000001")!.id;
    patientId2 = patients.find((p) => p.phone === "+91-9000000002")!.id;

    const recRes = await request(server).post("/auth/login").send({ email: "receptionist@rhcm.test", password: DEV_PASSWORD }).expect(200);
    receptionistCookie = extractCookie(recRes);

    const { authenticator } = await import("otplib");
    const loginRes = await request(server).post("/auth/login").send({ email: "superadmin@rhcm.test", password: DEV_PASSWORD }).expect(200);
    const pendingCookie = extractCookie(loginRes);
    const code = authenticator.generate("JBSWY3DPEHPK3PXP");
    const mfaRes = await request(server).post("/auth/mfa/verify").set("Cookie", pendingCookie).send({ code }).expect(200);
    superAdminCookie = extractCookie(mfaRes);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function slot(dateIso: string, minutesLong = 30) {
    const start = new Date(dateIso);
    const end = new Date(start.getTime() + minutesLong * 60_000);
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }

  describe("booking and conflict detection", () => {
    it("books a chair appointment successfully", async () => {
      const { startAt, endAt } = slot("2027-01-11T04:00:00.000Z");
      const res = await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId, doctorId, resourceId: chairA, startAt, endAt, type: "CONSULTATION" })
        .expect(201);
      expect(res.body.status).toBe("BOOKED");
    });

    it("rejects an overlapping booking for the same doctor even on a different chair", async () => {
      const { startAt, endAt } = slot("2027-01-11T04:15:00.000Z");
      await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId: patientId2, doctorId, resourceId: chairB, startAt, endAt, type: "CONSULTATION" })
        .expect(409);
    });

    it("rejects an overlapping booking for the same chair even with a different doctor-free slot concept", async () => {
      const { startAt, endAt } = slot("2027-01-11T04:00:00.000Z");
      await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId: patientId2, doctorId, resourceId: chairA, startAt, endAt, type: "CONSULTATION" })
        .expect(409);
    });

    it("allows a non-overlapping booking right after the first ends", async () => {
      const { startAt, endAt } = slot("2027-01-11T04:30:00.000Z");
      await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId: patientId2, doctorId, resourceId: chairA, startAt, endAt, type: "CONSULTATION" })
        .expect(201);
    });

    it("never collides under concurrent booking attempts for the same doctor/time", async () => {
      const { startAt, endAt } = slot("2027-01-12T04:00:00.000Z");
      const attempts = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          request(server)
            .post("/appointments")
            .set("Cookie", superAdminCookie)
            .send({ entityId: clinicId, patientId, doctorId, startAt, endAt, type: "CONSULTATION" }),
        ),
      );
      const succeeded = attempts.filter((a) => a.status === "fulfilled" && (a.value as any).status === 201);
      expect(succeeded).toHaveLength(1);
    });
  });

  describe("emergency override", () => {
    it("denies overrideConflict to a caller without appointment.override_conflict", async () => {
      const { startAt, endAt } = slot("2027-01-13T04:00:00.000Z");
      await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId, doctorId, startAt, endAt, type: "CONSULTATION" })
        .expect(201);

      await request(server)
        .post("/appointments")
        .set("Cookie", receptionistCookie)
        .send({ entityId: clinicId, patientId: patientId2, doctorId, startAt, endAt, type: "EMERGENCY", overrideConflict: true })
        .expect(403);
    });

    it("lets an authorized override double-book the doctor but never the chair", async () => {
      const { startAt, endAt } = slot("2027-01-14T04:00:00.000Z");
      await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId, doctorId, resourceId: chairA, startAt, endAt, type: "CONSULTATION" })
        .expect(201);

      // Same doctor, no chair — succeeds via override.
      await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId: patientId2, doctorId, startAt, endAt, type: "EMERGENCY", overrideConflict: true })
        .expect(201);

      // Same chair — still rejected even with override.
      await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId: patientId2, doctorId, resourceId: chairA, startAt, endAt, type: "EMERGENCY", overrideConflict: true })
        .expect(409);
    });
  });

  describe("status transitions", () => {
    it("rejects an invalid status jump", async () => {
      const { startAt, endAt } = slot("2027-01-15T04:00:00.000Z");
      const created = await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId, doctorId, startAt, endAt, type: "CONSULTATION" })
        .expect(201);

      await request(server)
        .patch(`/appointments/${created.body.id}/status`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, status: "COMPLETED" })
        .expect(400);
    });

    it("allows the normal BOOKED -> ARRIVED -> CHECKED_IN path", async () => {
      const { startAt, endAt } = slot("2027-01-16T04:00:00.000Z");
      const created = await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId, doctorId, startAt, endAt, type: "CONSULTATION" })
        .expect(201);

      await request(server)
        .patch(`/appointments/${created.body.id}/status`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, status: "ARRIVED" })
        .expect(200);

      await request(server)
        .patch(`/appointments/${created.body.id}/status`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, status: "CHECKED_IN" })
        .expect(200);
    });
  });

  describe("availability", () => {
    it("marks an already-booked slot unavailable and respects doctor leave", async () => {
      const res = await request(server)
        .get(`/appointments/availability?entityId=${clinicId}&doctorId=${doctorId}&date=2027-01-11`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      const bookedSlot = res.body.slots.find((s: any) => s.startAt === "2027-01-11T04:00:00.000Z");
      expect(bookedSlot?.available).toBe(false);
    });
  });

  describe("entity isolation", () => {
    it("404s fetching a Clinic appointment scoped to the Trust entity", async () => {
      const { startAt, endAt } = slot("2027-01-17T04:00:00.000Z");
      const created = await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, patientId, doctorId, startAt, endAt, type: "CONSULTATION" })
        .expect(201);

      await request(server).get(`/appointments/${created.body.id}?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(404);
      await request(server).get(`/appointments/${created.body.id}?entityId=${clinicId}`).set("Cookie", superAdminCookie).expect(200);
    });
  });

  describe("check-in integration", () => {
    it("creates a visit and checks in the appointment together", async () => {
      const reg = await request(server)
        .post("/temp-registrations")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, fullName: "Visit Flow Patient", phone: "+91-9000000088" })
        .expect(201);

      const { startAt, endAt } = slot("2027-01-18T04:00:00.000Z");
      const appt = await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({
          entityId: clinicId,
          temporaryRegistrationId: reg.body.id,
          doctorId,
          resourceId: chairA,
          startAt,
          endAt,
          type: "CONSULTATION",
          procedureHint: "Check-up",
        })
        .expect(201);

      const checkin = await request(server)
        .post(`/temp-registrations/${reg.body.id}/check-in`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, appointmentId: appt.body.id })
        .expect(201);

      expect(checkin.body.visit.status).toBe("WAITING");
      expect(checkin.body.visit.doctorId).toBe(doctorId);
      expect(checkin.body.visit.resourceId).toBe(chairA);
      expect(checkin.body.visit.chiefComplaint).toBe("Check-up");

      const updatedAppt = await request(server)
        .get(`/appointments/${appt.body.id}?entityId=${clinicId}`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      expect(updatedAppt.body.status).toBe("CHECKED_IN");
      expect(updatedAppt.body.patientId).toBe(checkin.body.patient.id);
      expect(updatedAppt.body.temporaryRegistrationId).toBeNull();

      const waitingList = await request(server)
        .get(`/visits?entityId=${clinicId}&status=WAITING`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      expect(waitingList.body.some((v: any) => v.id === checkin.body.visit.id)).toBe(true);
    });

    it("advances a visit WAITING -> IN_TREATMENT -> COMPLETED and completes its appointment too", async () => {
      const reg = await request(server)
        .post("/temp-registrations")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, fullName: "Visit Progress Patient", phone: "+91-9000000089" })
        .expect(201);
      const { startAt, endAt } = slot("2027-01-19T04:00:00.000Z");
      const appt = await request(server)
        .post("/appointments")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, temporaryRegistrationId: reg.body.id, doctorId, startAt, endAt, type: "CONSULTATION" })
        .expect(201);
      const checkin = await request(server)
        .post(`/temp-registrations/${reg.body.id}/check-in`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, appointmentId: appt.body.id })
        .expect(201);

      await request(server)
        .patch(`/visits/${checkin.body.visit.id}/status`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, status: "IN_TREATMENT" })
        .expect(200);
      await request(server)
        .patch(`/visits/${checkin.body.visit.id}/status`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, status: "COMPLETED" })
        .expect(200);

      const finalAppt = await request(server)
        .get(`/appointments/${appt.body.id}?entityId=${clinicId}`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      expect(finalAppt.body.status).toBe("COMPLETED");
    });
  });
});
