import type Database from 'better-sqlite3';
import { buildFtsQueryVariants, normalizeLookupText } from './fts-query.js';

interface IdRow {
  id: string;
}

interface TitleRow {
  id: string;
  title: string;
  short_title: string | null;
}

const LOVDATA_ID_PATTERN =
  /^(?<kind>lov|for)-(?<rest>\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)?)$/iu;

export function normalizeDocumentId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(LOVDATA_ID_PATTERN);

  if (!match?.groups) {
    return trimmed;
  }

  return `${match.groups.kind.toUpperCase()}-${match.groups.rest.toUpperCase()}`;
}

export function isLovdataDocumentId(input: string): boolean {
  return LOVDATA_ID_PATTERN.test(input.trim());
}

export function resolveDocumentId(
  db: Database.Database,
  input: string,
): string | null {
  const trimmed = input.trim();

  if (trimmed === '') {
    return null;
  }

  const normalizedId = normalizeDocumentId(trimmed);
  const direct = db
    .prepare<[string], IdRow>(
      'SELECT id FROM legal_documents WHERE id = ? COLLATE NOCASE',
    )
    .get(normalizedId);

  if (direct) {
    return direct.id;
  }

  const exactTitle = db
    .prepare<[string, string], IdRow>(`
      SELECT id
      FROM legal_documents
      WHERE title = ? COLLATE NOCASE
        OR short_title = ? COLLATE NOCASE
      ORDER BY LENGTH(COALESCE(short_title, title)), id
      LIMIT 1
    `)
    .get(trimmed, trimmed);

  if (exactTitle) {
    return exactTitle.id;
  }

  for (const variant of buildFtsQueryVariants(trimmed)) {
    const match = db
      .prepare<[string], IdRow>(`
        SELECT ld.id
        FROM document_title_fts
        JOIN legal_documents ld ON ld.id = document_title_fts.document_id
        WHERE document_title_fts MATCH ?
        ORDER BY bm25(document_title_fts), LENGTH(COALESCE(ld.short_title, ld.title)), ld.id
        LIMIT 1
      `)
      .get(variant);

    if (match) {
      return match.id;
    }
  }

  return resolveDocumentIdByNormalizedTitleScan(db, trimmed);
}

function resolveDocumentIdByNormalizedTitleScan(
  db: Database.Database,
  input: string,
): string | null {
  const needle = normalizeLookupText(input);

  if (needle === '') {
    return null;
  }

  const rows = db
    .prepare<[], TitleRow>(
      'SELECT id, title, short_title FROM legal_documents ORDER BY id',
    )
    .all();
  const matches = rows
    .map((row) => ({
      row,
      haystack: normalizeLookupText(
        [row.title, row.short_title].filter(Boolean).join(' '),
      ),
    }))
    .filter(({ haystack }) => haystack.includes(needle))
    .sort((a, b) => {
      const aShort = a.row.short_title?.length ?? a.row.title.length;
      const bShort = b.row.short_title?.length ?? b.row.title.length;
      return aShort - bShort || a.row.id.localeCompare(b.row.id);
    });

  return matches[0]?.row.id ?? null;
}
