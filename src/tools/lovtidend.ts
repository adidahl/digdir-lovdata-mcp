import type Database from 'better-sqlite3';
import {
  ErrorCode,
  McpError,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  buildFtsQueryVariants,
  buildLikePattern,
} from '../utils/fts-query.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';
import {
  readLimit,
  readOptionalBoolean,
  readOptionalEnum,
  readOptionalString,
  readRequiredString,
} from './input.js';

type LovtidendOperation = 'change' | 'repeal' | 'add' | 'move';

interface LovtidendSearchRow {
  publication_id: string;
  refid: string;
  title: string;
  short_title: string | null;
  document_kind: string;
  publication_date: string | null;
  journal_number: string | null;
  source_url: string;
  source_archive_filename: string;
  affected_refs: string | null;
  operations: string | null;
  snippet: string;
  relevance: number;
}

interface LovtidendPublicationRow {
  id: string;
  refid: string;
  dokid: string | null;
  title: string;
  short_title: string | null;
  document_kind: string;
  department: string | null;
  date_in_force: string | null;
  publication_date: string | null;
  journal_number: string | null;
  source_archive_filename: string;
  archive_last_modified: string;
  source_url: string;
  source_xml_path: string | null;
  raw_xml_sha256: string;
  full_text: string;
  last_updated: string;
}

interface LovtidendReferenceRow {
  reference_type: string;
  target_ref: string;
  target_document_id: string | null;
  target_kind: string | null;
}

interface LovtidendChangePartRow {
  operation: string;
  target_ref: string;
  target_document_id: string | null;
  document_change_ref: string | null;
  text: string;
  element_id: string | null;
  xml_path: string | null;
}

export const SEARCH_LOVTIDEND_TOOL: Tool = {
  name: 'search_lovtidend',
  title: 'Search Norsk Lovtidend',
  description:
    'Search official Norsk Lovtidend avd. I publications and change provenance.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      document_id: { type: 'string' },
      refid: { type: 'string' },
      year: { type: ['number', 'string'] },
      date_from: { type: 'string' },
      date_to: { type: 'string' },
      operation: { type: 'string', enum: ['change', 'repeal', 'add', 'move'] },
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

export const GET_LOVTIDEND_PUBLICATION_TOOL: Tool = {
  name: 'get_lovtidend_publication',
  title: 'Get Norsk Lovtidend Publication',
  description:
    'Retrieve one Norsk Lovtidend avd. I publication with references and parsed change parts.',
  inputSchema: {
    type: 'object',
    properties: {
      publication_id: { type: 'string' },
      refid: { type: 'string' },
      include_full_text: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export const GET_DOCUMENT_CHANGE_PUBLICATIONS_TOOL: Tool = {
  name: 'get_document_change_publications',
  title: 'Get Document Change Publications',
  description:
    'Find Norsk Lovtidend avd. I publications that affect a current law, regulation, or provision-like target ref.',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: { type: 'string' },
      provision_ref: { type: 'string' },
      limit: { type: 'number', minimum: 1, maximum: 50 },
    },
    required: ['document_id'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export function callSearchLovtidendTool(
  db: Database.Database,
  args: Record<string, unknown>,
): CallToolResult {
  if (!hasLovtidendTables(db)) {
    return jsonToolResult(
      createToolResponse(
        db,
        [],
        'Lovtidend provenance tables are not present in this database. Run npm run build:db after Lovtidend normalization.',
      ),
    );
  }

  const query = readRequiredString(args, 'query');
  const limit = readLimit(args, 'limit', 10, 50);
  const filters = {
    documentId: normalizeDocumentId(readOptionalString(args, 'document_id')),
    refid: readOptionalString(args, 'refid'),
    year: readOptionalYear(args, 'year'),
    dateFrom: readOptionalString(args, 'date_from'),
    dateTo: readOptionalString(args, 'date_to'),
    operation: readOptionalEnum<LovtidendOperation>(args, 'operation', [
      'change',
      'repeal',
      'add',
      'move',
    ]),
  };
  let rows: LovtidendSearchRow[] = [];
  let queryStrategy = 'fts';

  for (const ftsQuery of buildFtsQueryVariants(query)) {
    rows = runLovtidendFtsSearch(db, ftsQuery, filters, limit);

    if (rows.length > 0) {
      break;
    }
  }

  if (rows.length === 0) {
    queryStrategy = 'like_fallback';
    rows = runLovtidendLikeSearch(db, query, filters, limit);
  }

  return jsonToolResult({
    ...createToolResponse(db, rows.map(formatSearchRow)),
    query,
    query_strategy: queryStrategy,
  });
}

export function callGetLovtidendPublicationTool(
  db: Database.Database,
  args: Record<string, unknown>,
): CallToolResult {
  if (!hasLovtidendTables(db)) {
    return jsonToolResult(
      createToolResponse(
        db,
        null,
        'Lovtidend provenance tables are not present in this database. Run npm run build:db after Lovtidend normalization.',
      ),
    );
  }

  const publicationId = readOptionalString(args, 'publication_id');
  const refid = readOptionalString(args, 'refid');
  const includeFullText = readOptionalBoolean(args, 'include_full_text') ?? false;

  if (!publicationId && !refid) {
    readRequiredString(args, 'publication_id');
  }

  const publication = db
    .prepare<
      [string | null, string | null, string | null, string | null],
      LovtidendPublicationRow
    >(`
      SELECT *
      FROM lovtidend_publications
      WHERE (? IS NOT NULL AND id = ?)
         OR (? IS NOT NULL AND refid = ?)
      LIMIT 1
    `)
    .get(publicationId ?? null, publicationId ?? null, refid ?? null, refid ?? null);

  if (!publication) {
    return jsonToolResult(
      createToolResponse(
        db,
        null,
        `No Lovtidend publication found for "${publicationId ?? refid}".`,
      ),
    );
  }

  const references = readPublicationReferences(db, publication.id);
  const changeParts = readPublicationChangeParts(db, publication.id);
  const { full_text: fullText, ...metadata } = publication;

  return jsonToolResult(
    createToolResponse(db, {
      publication: includeFullText
        ? { ...metadata, full_text: fullText }
        : metadata,
      affected_documents: references.filter(
        (reference) => reference.reference_type === 'changes_to_document',
      ),
      legal_bases: references.filter(
        (reference) => reference.reference_type === 'based_on',
      ),
      change_parts: changeParts,
      include_full_text: includeFullText,
    }),
  );
}

export function callGetDocumentChangePublicationsTool(
  db: Database.Database,
  args: Record<string, unknown>,
): CallToolResult {
  if (!hasLovtidendTables(db)) {
    return jsonToolResult(
      createToolResponse(
        db,
        [],
        'Lovtidend provenance tables are not present in this database. Run npm run build:db after Lovtidend normalization.',
      ),
    );
  }

  const inputDocumentId = readRequiredString(args, 'document_id');
  const documentId = normalizeDocumentId(inputDocumentId) ?? inputDocumentId;
  const provisionRef = readOptionalString(args, 'provision_ref');
  const limit = readLimit(args, 'limit', 10, 50);
  const rows = runDocumentChangeLookup(db, documentId, provisionRef, limit);

  return jsonToolResult(
    createToolResponse(db, {
      document_id: documentId,
      resolved_from: documentId === inputDocumentId ? undefined : inputDocumentId,
      provision_ref: provisionRef,
      publications: rows.map(formatSearchRow),
    }),
  );
}

function runLovtidendFtsSearch(
  db: Database.Database,
  ftsQuery: string,
  filters: LovtidendFilters,
  limit: number,
): LovtidendSearchRow[] {
  const where = ['lovtidend_fts MATCH ?'];
  const params: unknown[] = [ftsQuery];
  appendLovtidendFilters(where, params, filters);

  return db
    .prepare(`
      SELECT
        lp.id AS publication_id,
        lp.refid,
        lp.title,
        lp.short_title,
        lp.document_kind,
        lp.publication_date,
        lp.journal_number,
        lp.source_url,
        lp.source_archive_filename,
        affected_refs.refs AS affected_refs,
        operations.operations AS operations,
        snippet(lovtidend_fts, 4, '[', ']', '...', 32) AS snippet,
        bm25(lovtidend_fts) AS relevance
      FROM lovtidend_fts
      JOIN lovtidend_publications lp ON lp.id = lovtidend_fts.publication_id
      LEFT JOIN ${affectedRefsSubquery()} affected_refs
        ON affected_refs.publication_id = lp.id
      LEFT JOIN ${operationsSubquery()} operations
        ON operations.publication_id = lp.id
      WHERE ${where.join(' AND ')}
      ORDER BY relevance, lp.publication_date DESC, lp.id DESC
      LIMIT ?
    `)
    .all(...params, limit) as LovtidendSearchRow[];
}

function runLovtidendLikeSearch(
  db: Database.Database,
  query: string,
  filters: LovtidendFilters,
  limit: number,
): LovtidendSearchRow[] {
  const where = [
    '(lp.title LIKE ? OR lp.short_title LIKE ? OR lp.refid LIKE ? OR lp.full_text LIKE ?)',
  ];
  const like = buildLikePattern(query);
  const params: unknown[] = [like, like, like, like];
  appendLovtidendFilters(where, params, filters);

  return db
    .prepare(`
      SELECT
        lp.id AS publication_id,
        lp.refid,
        lp.title,
        lp.short_title,
        lp.document_kind,
        lp.publication_date,
        lp.journal_number,
        lp.source_url,
        lp.source_archive_filename,
        affected_refs.refs AS affected_refs,
        operations.operations AS operations,
        substr(lp.full_text, 1, 320) AS snippet,
        0 AS relevance
      FROM lovtidend_publications lp
      LEFT JOIN ${affectedRefsSubquery()} affected_refs
        ON affected_refs.publication_id = lp.id
      LEFT JOIN ${operationsSubquery()} operations
        ON operations.publication_id = lp.id
      WHERE ${where.join(' AND ')}
      ORDER BY lp.publication_date DESC, lp.id DESC
      LIMIT ?
    `)
    .all(...params, limit) as LovtidendSearchRow[];
}

interface LovtidendFilters {
  documentId?: string;
  refid?: string;
  year?: string;
  dateFrom?: string;
  dateTo?: string;
  operation?: LovtidendOperation;
}

function appendLovtidendFilters(
  where: string[],
  params: unknown[],
  filters: LovtidendFilters,
): void {
  if (filters.documentId) {
    where.push(`(
      EXISTS (
        SELECT 1 FROM lovtidend_references lr
        WHERE lr.publication_id = lp.id AND lr.target_document_id = ?
      )
      OR EXISTS (
        SELECT 1 FROM lovtidend_change_parts lcp
        WHERE lcp.publication_id = lp.id AND lcp.target_document_id = ?
      )
    )`);
    params.push(filters.documentId, filters.documentId);
  }

  if (filters.refid) {
    where.push(`(
      lp.refid = ?
      OR EXISTS (
        SELECT 1 FROM lovtidend_references lr
        WHERE lr.publication_id = lp.id AND lr.target_ref = ?
      )
      OR EXISTS (
        SELECT 1 FROM lovtidend_change_parts lcp
        WHERE lcp.publication_id = lp.id AND lcp.target_ref = ?
      )
    )`);
    params.push(filters.refid, filters.refid, filters.refid);
  }

  if (filters.year) {
    where.push('substr(lp.publication_date, 1, 4) = ?');
    params.push(filters.year);
  }

  if (filters.dateFrom) {
    where.push('lp.publication_date >= ?');
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    where.push('lp.publication_date <= ?');
    params.push(`${filters.dateTo}T23:59:59`);
  }

  if (filters.operation) {
    where.push(`EXISTS (
      SELECT 1 FROM lovtidend_change_parts lcp
      WHERE lcp.publication_id = lp.id AND lcp.operation = ?
    )`);
    params.push(filters.operation);
  }
}

function runDocumentChangeLookup(
  db: Database.Database,
  documentId: string,
  provisionRef: string | undefined,
  limit: number,
): LovtidendSearchRow[] {
  const params: unknown[] = [documentId, documentId];
  let where = `(
    EXISTS (
      SELECT 1 FROM lovtidend_references lr
      WHERE lr.publication_id = lp.id AND lr.target_document_id = ?
    )
    OR EXISTS (
      SELECT 1 FROM lovtidend_change_parts lcp
      WHERE lcp.publication_id = lp.id AND lcp.target_document_id = ?
    )
  )`;

  if (provisionRef) {
    where = `EXISTS (
      SELECT 1 FROM lovtidend_change_parts lcp
      WHERE lcp.publication_id = lp.id
        AND lcp.target_document_id = ?
        AND lcp.target_ref LIKE ?
    )`;
    params.length = 0;
    params.push(documentId, `%/${normalizeProvisionRef(provisionRef)}%`);
  }

  return db
    .prepare(`
      SELECT
        lp.id AS publication_id,
        lp.refid,
        lp.title,
        lp.short_title,
        lp.document_kind,
        lp.publication_date,
        lp.journal_number,
        lp.source_url,
        lp.source_archive_filename,
        affected_refs.refs AS affected_refs,
        operations.operations AS operations,
        substr(lp.full_text, 1, 320) AS snippet,
        0 AS relevance
      FROM lovtidend_publications lp
      LEFT JOIN ${affectedRefsSubquery()} affected_refs
        ON affected_refs.publication_id = lp.id
      LEFT JOIN ${operationsSubquery()} operations
        ON operations.publication_id = lp.id
      WHERE ${where}
      ORDER BY lp.publication_date DESC, lp.id DESC
      LIMIT ?
    `)
    .all(...params, limit) as LovtidendSearchRow[];
}

function readPublicationReferences(
  db: Database.Database,
  publicationId: string,
): LovtidendReferenceRow[] {
  return db
    .prepare<[string], LovtidendReferenceRow>(`
      SELECT reference_type, target_ref, target_document_id, target_kind
      FROM lovtidend_references
      WHERE publication_id = ?
      ORDER BY reference_type, target_ref
    `)
    .all(publicationId);
}

function readPublicationChangeParts(
  db: Database.Database,
  publicationId: string,
): LovtidendChangePartRow[] {
  return db
    .prepare<[string], LovtidendChangePartRow>(`
      SELECT
        operation,
        target_ref,
        target_document_id,
        document_change_ref,
        text,
        element_id,
        xml_path
      FROM lovtidend_change_parts
      WHERE publication_id = ?
      ORDER BY id
    `)
    .all(publicationId);
}

function affectedRefsSubquery(): string {
  return `(
    SELECT publication_id, group_concat(DISTINCT target_ref) AS refs
    FROM lovtidend_references
    WHERE reference_type = 'changes_to_document'
    GROUP BY publication_id
  )`;
}

function operationsSubquery(): string {
  return `(
    SELECT publication_id, group_concat(DISTINCT operation) AS operations
    FROM lovtidend_change_parts
    GROUP BY publication_id
  )`;
}

function formatSearchRow(row: LovtidendSearchRow): Record<string, unknown> {
  return {
    publication_id: row.publication_id,
    refid: row.refid,
    title: row.title,
    short_title: row.short_title,
    document_kind: row.document_kind,
    publication_date: row.publication_date,
    journal_number: row.journal_number,
    affected_refs: splitGroupConcat(row.affected_refs),
    operations: splitGroupConcat(row.operations),
    source_url: row.source_url,
    source_archive_filename: row.source_archive_filename,
    snippet: row.snippet,
    relevance: row.relevance,
  };
}

function splitGroupConcat(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

function normalizeDocumentId(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const refMatch = /^(lov|forskrift)\/(\d{4}-\d{2}-\d{2}(?:-\d+)?)/u.exec(
    value.toLowerCase(),
  );
  if (refMatch) {
    return `${refMatch[1] === 'lov' ? 'LOV' : 'FOR'}-${refMatch[2]}`;
  }

  const upper = value.trim().toUpperCase();
  if (/^(LOV|FOR)-\d{4}-\d{2}-\d{2}/u.test(upper)) {
    return upper;
  }

  return undefined;
}

function normalizeProvisionRef(value: string): string {
  return value.replace(/\s+/gu, '');
}

function readOptionalYear(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const year = typeof value === 'number' ? String(Math.trunc(value)) : String(value);

  if (!/^\d{4}$/u.test(year)) {
    throw new McpError(ErrorCode.InvalidParams, `${key} must be a four-digit year.`);
  }

  return year;
}

function hasLovtidendTables(db: Database.Database): boolean {
  return Boolean(
    db
      .prepare<[string], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get('lovtidend_publications'),
  );
}
