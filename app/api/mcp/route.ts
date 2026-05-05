import Database from 'better-sqlite3';
import { createMcpHandler } from 'mcp-handler';
import { ensureVercelDatabasePath } from '../../../src/vercel-database';
import { registerToolHandlers } from '../../../src/tools/registry';

const SERVER_NAME = 'digdir-norwegian-law';
const SERVER_VERSION = '0.1.0';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handler = createMcpHandler(
  async (mcpServer) => {
    const dbPath = await ensureVercelDatabasePath();
    const db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
    });

    db.pragma('query_only = ON');
    mcpServer.server.onclose = () => {
      if (db.open) {
        db.close();
      }
    };

    registerToolHandlers(mcpServer.server, {
      db,
      dbPath,
      serverVersion: SERVER_VERSION,
    });
  },
  {
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    capabilities: {
      tools: {},
    },
  },
  {
    basePath: '/api',
    disableSse: true,
    maxDuration,
  },
);

export { handler as DELETE, handler as GET, handler as POST };
