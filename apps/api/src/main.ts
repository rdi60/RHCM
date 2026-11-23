import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import express from "express";
import session from "express-session";
import { createClient } from "redis";
import RedisStore from "connect-redis";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  // bodyParser: false, then only express.json() below — this API never
  // accepts url-encoded or multipart bodies (file uploads go straight to
  // object storage via a presigned URL, never through this server), so
  // there's no reason to parse them. Keeping only a JSON parser also means
  // a cross-site <form> POST (a "simple request" the browser never
  // preflights) can't carry a body this server will parse at all — one
  // more layer under SameSite=lax cookies + the single-origin CORS policy
  // below, which already stop a script on another origin from completing
  // a credentialed JSON request here.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(express.json({ limit: "1mb" }));

  const config = app.get(ConfigService);

  // This API is always meant to run behind a reverse proxy/load balancer
  // in production (see docker-compose.prod.yml) — trust its
  // X-Forwarded-* headers so req.ip and req.secure (which the session
  // cookie's `secure` flag depends on, above) reflect the real client.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.enableCors({
    origin: config.get("WEB_BASE_URL") ?? "http://localhost:3000",
    credentials: true,
  });

  const redisClient = createClient({ url: config.getOrThrow("REDIS_URL") });
  redisClient.on("error", (err) => console.error("Redis client error", err));
  await redisClient.connect();

  const idleTimeoutMinutes = Number(config.get("SESSION_IDLE_TIMEOUT_MINUTES") ?? 30);

  app.use(
    session({
      store: new RedisStore({ client: redisClient, prefix: "rhcm:sess:" }),
      secret: config.getOrThrow("SESSION_SECRET"),
      name: "rhcm.sid",
      resave: false,
      saveUninitialized: false,
      rolling: true, // sliding idle-timeout: every authenticated request extends the cookie
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: idleTimeoutMinutes * 60 * 1000,
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // On by default outside production (local/dev/staging); off in production
  // unless explicitly opted into with ENABLE_API_DOCS=true — this is a
  // multi-tenant clinic system, so the full route/schema map isn't
  // something to publish by default. Even when enabled, every route still
  // enforces its own @RequirePermissions/@Public/@SelfService guard as
  // normal — "Try it out" in this UI still needs a real, permitted session.
  const enableApiDocs = process.env.NODE_ENV !== "production" || config.get("ENABLE_API_DOCS") === "true";
  if (enableApiDocs) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("RHCM API")
      .setDescription(
        "Dental Clinic & Charity Trust Management System — a session-cookie-authenticated REST API. " +
          "This page can't log in for you: authenticate first in a cookie-aware client " +
          "(POST /auth/login, then POST /auth/mfa/verify if MFA is enabled), then use that same " +
          "client/browser tab to try requests here.",
      )
      .setVersion("1.0")
      .addCookieAuth("rhcm.sid", { type: "apiKey", in: "cookie", name: "rhcm.sid" })
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = Number(config.get("API_PORT") ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`RHCM API listening on :${port}`);
}

bootstrap();
