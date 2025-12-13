import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma || (global.prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  }));
