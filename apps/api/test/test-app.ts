import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import session from "express-session";
import { createClient } from "redis";
import RedisStore from "connect-redis";
import request from "supertest";
import { authenticator } from "otplib";
import { prisma } from "@rhcm/database";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { StorageService } from "../src/storage/storage.service";
import { FakeStorageService } from "./fakes/fake-storage.service";

export const DEV_PASSWORD = "DevPass!2026";
const DEV_MFA_SECRET = "JBSWY3DPEHPK3PXP";

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useClass(FakeStorageService)
    .compile();
  const app = moduleRef.createNestApplication();
  const config = app.get(ConfigService);

  const redisClient = createClient({ url: config.getOrThrow("REDIS_URL") });
  await redisClient.connect();

  app.use(
    session({
      store: new RedisStore({ client: redisClient, prefix: "rhcm:test:sess:" }),
      secret: config.getOrThrow("SESSION_SECRET"),
      name: "rhcm.sid",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, secure: false, sameSite: "lax", maxAge: 30 * 60 * 1000 },
    }),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();
  return app;
}

/** Extracts the `Set-Cookie` session cookie from a supertest response so it can be replayed on the next request. */
export function extractCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  if (!raw || raw.length === 0) throw new Error("Response carried no Set-Cookie header");
  return raw.map((c) => c.split(";")[0]).join("; ");
}

/**
 * Logs in a seeded MFA-enabled user with the shared dev MFA secret. Clears
 * the user's TOTP replay-guard state (AuthService.verifyMfa's lastMfaStep)
 * first: the e2e suite logs the same handful of seeded users in many times
 * — within one spec file and across spec files run `--runInBand` — often
 * within the same real 30-second TOTP step, which replay protection would
 * otherwise (correctly, for a real attacker) reject.
 */
export async function loginWithMfa(server: unknown, email: string, password: string = DEV_PASSWORD): Promise<string> {
  await prisma.user.updateMany({ where: { email }, data: { lastMfaStep: null } });
  const loginRes = await request(server as never)
    .post("/auth/login")
    .send({ email, password })
    .expect(200);
  const pendingCookie = extractCookie(loginRes);
  const code = authenticator.generate(DEV_MFA_SECRET);
  const mfaRes = await request(server as never)
    .post("/auth/mfa/verify")
    .set("Cookie", pendingCookie)
    .send({ code })
    .expect(200);
  return extractCookie(mfaRes);
}
