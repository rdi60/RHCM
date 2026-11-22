import { PrismaClient } from "../generated/client";

declare global {
  // eslint-disable-next-line no-var
  var __rhcmPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__rhcmPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__rhcmPrisma = prisma;
}

export * from "../generated/client";
export * from "./sequences";
