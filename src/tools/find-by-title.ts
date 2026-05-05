import type Database from 'better-sqlite3';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  buildFtsQueryVariants,
  normalizeLookupText,
} from '../utils/fts-query.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';
import {
  readLimit,
  readOptionalEnum,
  readRequiredString,
} from './input.js';

type DocumentType = 'lov' | 'forskrift';
type SourceDataset = 'gjeldende-lover' | 'gjeldende-sentrale-forskrifter';

interface TitleRow {
  id: string;
  title: string;
  short_title: string | null;
  document_type: string;
  source_dataset: string;
  department: string | null;
  legal_area: string | null;
  source_url: string;
  archive_filename: string;
  archive_last_modified: string;
  relevance: number;
}

export const FIND_BY_TITLE_TOOL: Tool = {
  name: 'find_by_title',
  title: 'Find By Title',
  description:
    'Resolve Norwegian law or regulation titles and short titles to stable Lovdata IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      document_type: { type: 'string', enum: ['lov', 'forskrift'] },
      source_dataset: {
        type: 'string',
        enum: ['gjeldende-lover', 'gjeldende-sentrale-forskrifter'],
      },
      limit: { type: 'number', minimum: 1, maximum: 50 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export function callFindByTitleTool(
  db: Database.Database,
  args: Record<string, unknown>,
): CallToolResult {
  const query = readRequiredString(args, 'query');
  const limit = readLimit(args, 'limit', 10, 50);
  const filters = {
    documentType: readOptionalEnum<DocumentType>(args, 'document_type', [
      'lov',
      'forskrift',
    ]),
    sourceDataset: readOptionalEnum<SourceDataset>(args, 'source_dataset', [
      'gjeldende-lover',
      'gjeldende-sentrale-forskrifter',
    ]),
  };
  let rows: TitleRow[] = [];
  let queryStrategy = 'fts';

  for (const ftsQuery of buildFtsQueryVariants(query)) {
    rows = runTitleFtsSearch(db, ftsQuery, filters, limit);

    if (rows.length > 0) {
      break;
    }
  }

  if (rows.length === 0) {
    queryStrategy = 'normalized_scan';
    rows = runNormalizedTitleScan(db, query, filters, limit);
  }

  return jsonToolResult({
    ...createToolResponse(db, rows),
    query,
    query_strategy: queryStrategy,
  });
}

function runTitleFtsSearch(
  db: Database.Database,
  ftsQuery: string,
  filters: {
    documentType?: DocumentType;
    sourceDataset?: SourceDataset;
  },
  limit: number,
): TitleRow[] {
  const where = ['document_title_fts MATCH ?'];
  const params: unknown[] = [ftsQuery];
  appendFilters(where, params, filters);

  const sql = `
    SELECT
      ld.id,
      ld.title,
      ld.short_title,
      ld.type AS document_type,
      ld.source_dataset,
      ld.department,
      ld.legal_area,
      ld.source_url,
      ld.archive_filename,
      ld.archive_last_modified,
      bm25(document_title_fts) AS relevance
    FROM document_title_fts
    JOIN legal_documents ld ON ld.id = document_title_fts.document_id
    WHERE ${where.join(' AND ')}
    ORDER BY relevance, LENGTH(COALESCE(ld.short_title, ld.title)), ld.id
    LIMIT ?
  `;

  return db.prepare(sql).all(...params, limit) as TitleRow[];
}

function runNormalizedTitleScan(
  db: Database.Database,
  query: string,
  filters: {
    documentType?: DocumentType;
    sourceDataset?: SourceDataset;
  },
  limit: number,
): TitleRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  appendFilters(where, params, filters);
  const rows = db
    .prepare(`
      SELECT
        ld.id,
        ld.title,
        ld.short_title,
        ld.type AS document_type,
        ld.source_dataset,
        ld.department,
        ld.legal_area,
        ld.source_url,
        ld.archive_filename,
        ld.archive_last_modified,
        0 AS relevance
      FROM legal_documents ld
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ld.id
    `)
    .all(...params) as TitleRow[];
  const needle = normalizeLookupText(query);

  return rows
    .map((row) => ({
      row,
      text: normalizeLookupText(
        [row.title, row.short_title].filter(Boolean).join(' '),
      ),
    }))
    .filter(({ text }) => text.includes(needle))
    .sort((a, b) => {
      const aLength = a.row.short_title?.length ?? a.row.title.length;
      const bLength = b.row.short_title?.length ?? b.row.title.length;
      return aLength - bLength || a.row.id.localeCompare(b.row.id);
    })
    .slice(0, limit)
    .map(({ row }) => row);
}

function appendFilters(
  where: string[],
  params: unknown[],
  filters: {
    documentType?: DocumentType;
    sourceDataset?: SourceDataset;
  },
): void {
  if (filters.documentType) {
    where.push('ld.type = ?');
    params.push(filters.documentType);
  }

  if (filters.sourceDataset) {
    where.push('ld.source_dataset = ?');
    params.push(filters.sourceDataset);
  }
}
