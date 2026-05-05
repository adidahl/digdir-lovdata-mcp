import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DB_PATH_ENV_VAR } from './runtime.js';

const DB_URL_ENV_VAR = 'DIGDIR_NORWEGIAN_LAW_DB_URL';
const DB_SHA256_ENV_VAR = 'DIGDIR_NORWEGIAN_LAW_DB_SHA256';
const TMP_DB_PATH = '/tmp/digdir-norwegian-law/database.db';

let databasePathPromise: Promise<string> | undefined;

export async function ensureVercelDatabasePath(): Promise<string> {
  databasePathPromise ??= resolveOrDownloadDatabase();
  return databasePathPromise;
}

async function resolveOrDownloadDatabase(): Promise<string> {
  const configuredPath = process.env[DB_PATH_ENV_VAR]?.trim();

  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  const localVercelDb = path.resolve(
    process.cwd(),
    'data',
    'database.vercel-current.db',
  );

  if (await pathExists(localVercelDb)) {
    return localVercelDb;
  }

  const bundledDb = path.resolve(process.cwd(), 'data', 'database.db');

  if (await pathExists(bundledDb)) {
    return bundledDb;
  }

  const dbUrl = process.env[DB_URL_ENV_VAR]?.trim();

  if (!dbUrl) {
    throw new Error(
      `Set ${DB_PATH_ENV_VAR} or ${DB_URL_ENV_VAR} so the MCP server can open SQLite.`,
    );
  }

  await downloadDatabase(dbUrl, TMP_DB_PATH);
  return TMP_DB_PATH;
}

async function downloadDatabase(url: string, outputPath: string): Promise<void> {
  const expectedSha256 = process.env[DB_SHA256_ENV_VAR]?.trim();

  if (await pathExists(outputPath)) {
    if (!expectedSha256 || (await sha256File(outputPath)) === expectedSha256) {
      return;
    }
  }

  await mkdir(path.dirname(outputPath), { recursive: true });

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Digdir-Norwegian-Law-MCP/0.1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Database download failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Database download failed: empty response body');
  }

  const tmpPath = `${outputPath}.tmp`;

  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(tmpPath),
  );

  if (expectedSha256) {
    const actualSha256 = await sha256File(tmpPath);

    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Downloaded database SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`,
      );
    }
  }

  await rename(tmpPath, outputPath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}
