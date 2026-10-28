import { PrismaClient } from "@prisma/client";
import { changeLog } from "@/lib/change-log";

const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined;
};

const base =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

// Every change to deals, quotations and prices is recorded in the change
// history (see change-log.ts).
export const prisma = base.$extends(changeLog);
