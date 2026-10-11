import { PrismaClient } from '@prisma/client';

// Singleton instance of PrismaClient to prevent exhausting DB connections
export const prisma = new PrismaClient();

export const dbConfig = {
  baseUrl: process.env.DATABASE_URL,
  port: process.env.PORT || 3000,
};
