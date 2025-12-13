import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma?: PrismaClient;
}

export const prisma =
  global.__prisma ?? (global.__prisma = new PrismaClient());
