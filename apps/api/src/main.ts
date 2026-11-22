import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import session from "express-session";
import { createClient } from "redis";
import RedisStore from "connect-redis";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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

  const port = Number(config.get("API_PORT") ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`RHCM API listening on :${port}`);
}

bootstrap();
