import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import session from "express-session";
import { createClient } from "redis";
import RedisStore from "connect-redis";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { StorageService } from "../src/storage/storage.service";
import { FakeStorageService } from "./fakes/fake-storage.service";

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
