import { NextResponse } from 'next/server';

import { prisma } from '@/server/db/prisma';

import packageJson from '../../../../package.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }

  const aiKey = process.env.GROQ_API_KEY;
  const isAiConfigured = Boolean(
    aiKey && aiKey.trim().length > 0 && aiKey !== 'your-groq-api-key-here',
  );
  const aiStatus: 'configured' | 'missing' = isAiConfigured
    ? 'configured'
    : 'missing';

  const isHealthy = dbStatus === 'ok';

  return NextResponse.json(
    {
      status: isHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      version: packageJson.version,
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: dbStatus,
        ai: aiStatus,
      },
    },
    {
      status: isHealthy ? 200 : 503,
    },
  );
}
