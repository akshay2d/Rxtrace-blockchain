import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  const dbUrl = process.env.DATABASE_URL;
  
  console.log('Prisma connection URL:', {
    hasUrl: !!dbUrl,
    host: dbUrl?.split('@')[1]?.split(':')[0],
    fullUrl: dbUrl
  });

  if (!dbUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({ 
    connectionString: dbUrl,
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  const adapter = new PrismaPg(pool);
  
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

export const prisma = global.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
