import Database from 'better-sqlite3';
import { ensureVercelDatabasePath } from '../../../src/vercel-database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  try {
    const dbPath = await ensureVercelDatabasePath();
    const db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      db.pragma('query_only = ON');
      db.prepare('SELECT 1').get();
    } finally {
      db.close();
    }

    return Response.json({
      status: 'ok',
      server: 'digdir-norwegian-law',
      database: {
        status: 'ok',
      },
    });
  } catch (error) {
    return Response.json(
      {
        status: 'error',
        server: 'digdir-norwegian-law',
        database: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown database error',
        },
      },
      {
        status: 503,
      },
    );
  }
}
