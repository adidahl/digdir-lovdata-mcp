import type Database from 'better-sqlite3';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  buildFtsQueryVariants,
  buildLikePattern,
} from '../utils/fts-query.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';
import {
  readLimit,
  readOptionalEnum,
  readOptionalString,
  readRequiredString,
  parseJsonArray,
} from './input.js';

interface SearchRow {
  document_id: string;
  document_title: string;
  document_type: string;
  source_dataset: string;
  provision_ref: string;
  heading: string | null;
  path: string;
  snippet: string;
  source_url: string;
  relevance: number;
}

type DocumentType = 'lov' | 'forskrift';
type SourceDataset = 'gjeldende-lover' | 'gjeldende-sentrale-forskrifter';

export const SEARCH_LEGISLATION_TOOL: Tool = {
  name: 'search_legislation',
  title: 'Search Legislation',
  description:
    'Search current Norwegian laws and central regulations by provision text.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      document_type: { type: 'string', enum: ['lov', 'forskrift'] },
      source_dataset: {
        type: 'string',
        enum: ['gjeldende-lover', 'gjeldende-sentrale-forskrifter'],
      },
      department: { type: 'string' },
      legal_area: { type: 'string' },
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

export function callSearchLegislationTool(
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
    department: readOptionalString(args, 'department'),
    legalArea: readOptionalString(args, 'legal_area'),
  };

  let rows: SearchRow[] = [];
  let queryStrategy = 'fts';

  for (const ftsQuery of buildFtsQueryVariants(query)) {
    rows = runFtsSearch(db, ftsQuery, filters, limit);

    if (rows.length > 0) {
      break;
    }
  }

  if (rows.length === 0) {
    queryStrategy = 'like_fallback';
    rows = runLikeSearch(db, query, filters, limit);
  }

  const results = rows.map((row) => ({
    document_id: row.document_id,
    document_title: row.document_title,
    document_type: row.document_type,
    source_dataset: row.source_dataset,
    provision_ref: row.provision_ref,
    heading: row.heading,
    path: parseJsonArray(row.path),
    snippet: row.snippet,
    source_url: row.source_url,
    relevance: row.relevance,
  }));

  return jsonToolResult({
    ...createToolResponse(db, results),
    query,
    query_strategy: queryStrategy,
  });
}

function runFtsSearch(
  db: Database.Database,
  ftsQuery: string,
  filters: {
    documentType?: DocumentType;
    sourceDataset?: SourceDataset;
    department?: string;
    legalArea?: string;
  },
  limit: number,
): SearchRow[] {
  const where = ['provisions_fts MATCH ?'];
  const params: unknown[] = [ftsQuery];
  appendFilters(where, params, filters);

  const sql = `
    SELECT
      lp.document_id,
      ld.title AS document_title,
      ld.type AS document_type,
      ld.source_dataset,
      lp.provision_ref,
      lp.heading,
      lp.path,
      snippet(provisions_fts, 0, '[', ']', '...', 32) AS snippet,
      ld.source_url,
      bm25(provisions_fts) AS relevance
    FROM provisions_fts
    JOIN legal_provisions lp ON lp.id = provisions_fts.rowid
    JOIN legal_documents ld ON ld.id = lp.document_id
    WHERE ${where.join(' AND ')}
    ORDER BY relevance
    LIMIT ?
  `;

  return db.prepare(sql).all(...params, limit) as SearchRow[];
}

function runLikeSearch(
  db: Database.Database,
  query: string,
  filters: {
    documentType?: DocumentType;
    sourceDataset?: SourceDataset;
    department?: string;
    legalArea?: string;
  },
  limit: number,
): SearchRow[] {
  const where = ['(lp.content LIKE ? OR lp.heading LIKE ?)'];
  const like = buildLikePattern(query);
  const params: unknown[] = [like, like];
  appendFilters(where, params, filters);

  const sql = `
    SELECT
      lp.document_id,
      ld.title AS document_title,
      ld.type AS document_type,
      ld.source_dataset,
      lp.provision_ref,
      lp.heading,
      lp.path,
      substr(lp.content, 1, 320) AS snippet,
      ld.source_url,
      0 AS relevance
    FROM legal_provisions lp
    JOIN legal_documents ld ON ld.id = lp.document_id
    WHERE ${where.join(' AND ')}
    ORDER BY ld.title, lp.id
    LIMIT ?
  `;

  return db.prepare(sql).all(...params, limit) as SearchRow[];
}

function appendFilters(
  where: string[],
  params: unknown[],
  filters: {
    documentType?: DocumentType;
    sourceDataset?: SourceDataset;
    department?: string;
    legalArea?: string;
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

  if (filters.department) {
    where.push('ld.department = ?');
    params.push(filters.department);
  }

  if (filters.legalArea) {
    where.push('ld.legal_area = ?');
    params.push(filters.legalArea);
  }
}
