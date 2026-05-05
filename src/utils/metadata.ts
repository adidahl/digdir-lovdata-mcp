import type Database from 'better-sqlite3';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export interface ResponseMetadata {
  generated_at: string;
  jurisdiction: 'NO';
  corpus: {
    source: string;
    datasets: string[];
    license: string;
    attribution: string;
  };
  data_freshness: {
    database_built_at: string | null;
    newest_archive_last_modified: string | null;
    schema_version: string | null;
  };
  coverage: {
    includes: string[];
    excludes: string[];
  };
  disclaimer: string;
  verification_required: string;
  note?: string;
}

interface MetadataRow {
  key: string;
  value: string;
}

interface FreshnessRow {
  newest_archive_last_modified: string | null;
}

interface CountRow {
  count: number;
}

export function generateResponseMetadata(
  db: Database.Database,
  note?: string,
): ResponseMetadata {
  const metadata = readDbMetadata(db);
  const freshness = readCurrentFreshness(db);
  const lovtidendFreshness = readLovtidendFreshness(db);

  return {
    generated_at: new Date().toISOString(),
    jurisdiction: 'NO',
    corpus: {
      source: 'Lovdata publicData',
      datasets: [
        'gjeldende-lover',
        'gjeldende-sentrale-forskrifter',
        'lovtidend-avd1',
      ],
      license: 'Norsk lisens for offentlige data (NLOD) 2.0',
      attribution:
        'Source data from Stiftelsen Lovdata publicData, processed and indexed by Digdir Norwegian Law MCP.',
    },
    data_freshness: {
      database_built_at: metadata.built_at ?? null,
      newest_archive_last_modified:
        newestString([
          freshness?.newest_archive_last_modified ?? null,
          lovtidendFreshness,
        ]),
      schema_version: metadata.schema_version ?? null,
    },
    coverage: {
      includes: [
        'current consolidated Norwegian laws',
        'current consolidated central regulations',
        'Norsk Lovtidend avd. I publication provenance when indexed',
      ],
      excludes: [
        'historical consolidated versions',
        'EU law tables',
        'case law',
        'preparatory works',
      ],
    },
    disclaimer:
      'Legal information only. This is not legal advice. Verify important answers against Lovdata or another official source before relying on them.',
    verification_required:
      'Always verify text, citations, and currency against the official source URL for professional or legal use.',
    ...(note ? { note } : {}),
  };
}

function readCurrentFreshness(db: Database.Database): FreshnessRow | undefined {
  return db
    .prepare<[], FreshnessRow>(`
      SELECT MAX(archive_last_modified) AS newest_archive_last_modified
      FROM legal_documents
    `)
    .get();
}

function readLovtidendFreshness(db: Database.Database): string | null {
  if (!tableExists(db, 'lovtidend_publications')) {
    return null;
  }

  return db
    .prepare<[], FreshnessRow>(`
      SELECT MAX(archive_last_modified) AS newest_archive_last_modified
      FROM lovtidend_publications
    `)
    .get()?.newest_archive_last_modified ?? null;
}

function tableExists(db: Database.Database, tableName: string): boolean {
  return (
    db
      .prepare<[string], CountRow>(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(tableName)?.count ?? 0
  ) > 0;
}

function newestString(values: Array<string | null>): string | null {
  return values.filter((value): value is string => value !== null).sort().at(-1) ?? null;
}

export function createToolResponse<T>(
  db: Database.Database,
  results: T,
  note?: string,
): ToolResponse<T> {
  return {
    results,
    _metadata: generateResponseMetadata(db, note),
  };
}

export function jsonToolResult(payload: object): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload as Record<string, unknown>,
  };
}

function readDbMetadata(db: Database.Database): Record<string, string> {
  return Object.fromEntries(
    db
      .prepare<[], MetadataRow>(
        'SELECT key, value FROM db_metadata ORDER BY key',
      )
      .all()
      .map((row) => [row.key, row.value]),
  );
}
