import { PrismaClient } from '@prisma/client';

// Singleton instance of PrismaClient to prevent exhausting DB connections
export const prisma = new PrismaClient();
