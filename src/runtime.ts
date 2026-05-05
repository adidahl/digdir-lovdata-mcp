import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerToolHandlers } from './tools/registry.js';

export const SERVER_NAME = 'digdir-norwegian-law';
export const DB_PATH_ENV_VAR = 'DIGDIR_NORWEGIAN_LAW_DB_PATH';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export interface McpRuntime {
  db: Database.Database;
  dbPath: string;
  server: Server;
  serverVersion: string;
  closeDatabase: () => void;
}

export function createMcpRuntime(): McpRuntime {
  const dbPath = resolveDatabasePath();
  const serverVersion = readPackageVersion();
  const db = openReadOnlyDatabase(dbPath);

  const server = new Server(
    {
      name: SERVER_NAME,
      version: serverVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const closeDatabase = (): void => {
    if (db.open) {
      db.close();
    }
  };

  server.onclose = closeDatabase;
  registerToolHandlers(server, {
    db,
    dbPath,
    serverVersion,
  });

  return {
    db,
    dbPath,
    server,
    serverVersion,
    closeDatabase,
  };
}

export function openReadOnlyDatabase(dbPath = resolveDatabasePath()): Database.Database {
  const db = new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  });

  db.pragma('query_only = ON');

  return db;
}

export function resolveDatabasePath(): string {
  const configuredPath = process.env[DB_PATH_ENV_VAR];

  if (configuredPath && configuredPath.trim() !== '') {
    return path.resolve(configuredPath);
  }

  return path.join(PROJECT_ROOT, 'data', 'database.db');
}

export function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'),
    ) as { version?: unknown };

    return typeof packageJson.version === 'string'
      ? packageJson.version
      : '0.1.0';
  } catch {
    return '0.1.0';
  }
}
