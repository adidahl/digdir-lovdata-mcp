import type Database from 'better-sqlite3';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';

export interface AboutContext {
  db: Database.Database;
  dbPath: string;
  serverVersion: string;
}

interface CountRow {
  count: number;
}

interface MetadataRow {
  key: string;
  value: string;
}

interface SourceDatasetRow {
  dataset: string;
  documents: number;
  archive_last_modified: string;
}

interface DocumentTypeRow {
  type: string;
  documents: number;
}

interface FreshnessRow {
  max_archive_last_modified: string | null;
  max_document_last_updated: string | null;
}

interface LovtidendOperationRow {
  operation: string;
  changes: number;
}

interface LovtidendFreshnessRow {
  max_archive_last_modified: string | null;
  max_publication_date: string | null;
  max_indexed_at: string | null;
}

const EMPTY_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} satisfies Tool['inputSchema'];

export const ABOUT_TOOL: Tool = {
  name: 'about',
  title: 'About',
  description:
    'Return server metadata, corpus counts, freshness, source warning, and legal disclaimer.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export function callAboutTool(context: AboutContext): CallToolResult {
  const metadata = readMetadata(context.db);
  const documentCount = readCount(
    context.db,
    'SELECT COUNT(*) AS count FROM legal_documents',
  );
  const provisionCount = readCount(
    context.db,
    'SELECT COUNT(*) AS count FROM legal_provisions',
  );
  const sourceDatasets = context.db
    .prepare<[], SourceDatasetRow>(`
      SELECT
        source_dataset AS dataset,
        COUNT(*) AS documents,
        MAX(archive_last_modified) AS archive_last_modified
      FROM legal_documents
      GROUP BY source_dataset
      ORDER BY source_dataset
    `)
    .all();
  const documentTypes = context.db
    .prepare<[], DocumentTypeRow>(`
      SELECT type, COUNT(*) AS documents
      FROM legal_documents
      GROUP BY type
      ORDER BY type
    `)
    .all();
  const freshness = context.db
    .prepare<[], FreshnessRow>(`
      SELECT
        MAX(archive_last_modified) AS max_archive_last_modified,
        MAX(last_updated) AS max_document_last_updated
      FROM legal_documents
    `)
    .get() ?? {
    max_archive_last_modified: null,
    max_document_last_updated: null,
  };
  const lovtidendAvailable = tableExists(context.db, 'lovtidend_publications');
  const lovtidendPublicationCount = lovtidendAvailable
    ? readCount(context.db, 'SELECT COUNT(*) AS count FROM lovtidend_publications')
    : 0;
  const lovtidendChangePartCount = lovtidendAvailable
    ? readCount(context.db, 'SELECT COUNT(*) AS count FROM lovtidend_change_parts')
    : 0;
  const lovtidendOperations = lovtidendAvailable
    ? context.db
        .prepare<[], LovtidendOperationRow>(`
          SELECT operation, COUNT(*) AS changes
          FROM lovtidend_change_parts
          GROUP BY operation
          ORDER BY operation
        `)
        .all()
    : [];
  const lovtidendFreshness = lovtidendAvailable
    ? context.db
        .prepare<[], LovtidendFreshnessRow>(`
          SELECT
            MAX(archive_last_modified) AS max_archive_last_modified,
            MAX(publication_date) AS max_publication_date,
            MAX(last_updated) AS max_indexed_at
          FROM lovtidend_publications
        `)
        .get()
    : undefined;

  return jsonToolResult(createToolResponse(context.db, {
    name: 'digdir-norwegian-law',
    version: context.serverVersion,
    jurisdiction: 'NO',
    database: {
      path: context.dbPath,
      schema_version: metadata.schema_version ?? null,
      built_at: metadata.built_at ?? null,
      builder: metadata.builder ?? null,
    },
    coverage: {
      status: 'mvp',
      includes: [
        'current Norwegian laws',
        'current central regulations',
        'Norsk Lovtidend avd. I provenance when indexed',
      ],
      excludes: [
        'historical provision versions',
        'EU law tables',
        'case law',
        'preparatory works',
      ],
    },
    counts: {
      documents: documentCount,
      provisions: provisionCount,
      by_document_type: Object.fromEntries(
        documentTypes.map((row) => [row.type, row.documents]),
      ),
      by_source_dataset: Object.fromEntries(
        sourceDatasets.map((row) => [row.dataset, row.documents]),
      ),
      lovtidend_publications: lovtidendPublicationCount,
      lovtidend_change_parts: lovtidendChangePartCount,
      lovtidend_change_parts_by_operation: Object.fromEntries(
        lovtidendOperations.map((row) => [row.operation, row.changes]),
      ),
    },
    freshness: {
      newest_source_archive_last_modified:
        freshness.max_archive_last_modified,
      last_indexed_at: freshness.max_document_last_updated,
      source_datasets: sourceDatasets,
      lovtidend: {
        newest_archive_last_modified:
          lovtidendFreshness?.max_archive_last_modified ?? null,
        newest_publication_date:
          lovtidendFreshness?.max_publication_date ?? null,
        last_indexed_at: lovtidendFreshness?.max_indexed_at ?? null,
      },
    },
    source_warning:
      'This server indexes Lovdata publicData snapshots. Verify important answers against Lovdata or other official sources before relying on them.',
    legal_disclaimer:
      'This MCP server provides legal information retrieval support only and does not provide legal advice.',
  }));
}

function readMetadata(db: Database.Database): Record<string, string> {
  return Object.fromEntries(
    db
      .prepare<[], MetadataRow>(
        'SELECT key, value FROM db_metadata ORDER BY key',
      )
      .all()
      .map((row) => [row.key, row.value]),
  );
}

function readCount(db: Database.Database, sql: string): number {
  return db.prepare<[], CountRow>(sql).get()?.count ?? 0;
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
