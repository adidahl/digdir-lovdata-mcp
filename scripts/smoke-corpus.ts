#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

import { callFindByTitleTool } from '../src/tools/find-by-title.js';
import { callSearchLovtidendTool } from '../src/tools/lovtidend.js';
import { callSearchLegislationTool } from '../src/tools/search-legislation.js';

interface CountRow {
  type: string;
  count: number;
}

interface ToolTextResult {
  content?: Array<{
    type: string;
    text?: string;
  }>;
}

interface SearchPayload {
  results: Array<{
    document_id: string;
    document_type: string;
    source_dataset: string;
    snippet: string;
  }>;
}

interface TitlePayload {
  results: Array<{
    id: string;
    short_title: string | null;
  }>;
}

interface LovtidendSearchPayload {
  results: Array<{
    publication_id: string;
    snippet: string;
  }>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DB_PATH =
  process.env.DIGDIR_NORWEGIAN_LAW_DB_PATH ??
  path.join(PROJECT_ROOT, 'data', 'database.db');

function main(): void {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const documentCounts = countByType(
      db,
      'SELECT type, COUNT(*) AS count FROM legal_documents GROUP BY type ORDER BY type',
    );
    const provisionCounts = countByType(
      db,
      `
        SELECT ld.type, COUNT(*) AS count
        FROM legal_provisions lp
        JOIN legal_documents ld ON ld.id = lp.document_id
        GROUP BY ld.type
        ORDER BY ld.type
      `,
    );

    assert.ok((documentCounts.lov ?? 0) > 0, 'Expected at least one current law');
    assert.ok(
      (documentCounts.forskrift ?? 0) > 0,
      'Expected at least one current central regulation',
    );
    assert.ok((provisionCounts.lov ?? 0) > 0, 'Expected law provisions');
    assert.ok(
      (provisionCounts.forskrift ?? 0) > 0,
      'Expected central regulation provisions',
    );

    const lawSearch = readToolJson<SearchPayload>(
      callSearchLegislationTool(db, {
        query: 'personopplysninger',
        document_type: 'lov',
        limit: 1,
      }),
      'law search',
    );
    assert.ok(lawSearch.results.length > 0, 'Expected a law search result');
    assert.equal(lawSearch.results[0]?.document_type, 'lov');

    const regulationSearch = readToolJson<SearchPayload>(
      callSearchLegislationTool(db, {
        query: 'arbeidsmiljø',
        document_type: 'forskrift',
        limit: 1,
      }),
      'regulation search',
    );
    assert.ok(
      regulationSearch.results.length > 0,
      'Expected a central regulation search result',
    );
    assert.equal(regulationSearch.results[0]?.document_type, 'forskrift');

    const titleLookup = readToolJson<TitlePayload>(
      callFindByTitleTool(db, {
        query: 'personopplysningsloven',
        document_type: 'lov',
        limit: 3,
      }),
      'title lookup',
    );
    assert.equal(titleLookup.results[0]?.id, 'LOV-2018-06-15-38');

    const lovtidendPublications = tableExists(db, 'lovtidend_publications')
      ? db
          .prepare<[], { count: number }>(
            'SELECT COUNT(*) AS count FROM lovtidend_publications',
          )
          .get()?.count ?? 0
      : 0;
    let lovtidendSearchId = 'not_indexed';

    if (lovtidendPublications > 0) {
      const lovtidendSearch = readToolJson<LovtidendSearchPayload>(
        callSearchLovtidendTool(db, {
          query: 'endring',
          limit: 1,
        }),
        'Lovtidend search',
      );
      assert.ok(
        lovtidendSearch.results.length > 0,
        'Expected a Lovtidend search result',
      );
      lovtidendSearchId = lovtidendSearch.results[0]?.publication_id ?? 'missing';
    }

    console.log(
      [
        'Corpus smoke test passed:',
        `documents=${JSON.stringify(documentCounts)}`,
        `provisions=${JSON.stringify(provisionCounts)}`,
        `law_search=${lawSearch.results[0]?.document_id}`,
        `regulation_search=${regulationSearch.results[0]?.document_id}`,
        `title_lookup=${titleLookup.results[0]?.id}`,
        `lovtidend_publications=${lovtidendPublications}`,
        `lovtidend_search=${lovtidendSearchId}`,
      ].join(' '),
    );
  } finally {
    db.close();
  }
}

function tableExists(db: Database.Database, tableName: string): boolean {
  return (
    db
      .prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(tableName)?.count ?? 0
  ) > 0;
}

function countByType(db: Database.Database, sql: string): Record<string, number> {
  return Object.fromEntries(
    db
      .prepare<[], CountRow>(sql)
      .all()
      .map((row) => [row.type, row.count]),
  );
}

function readToolJson<T>(result: ToolTextResult, label: string): T {
  const text = result.content?.find((item) => item.type === 'text')?.text;

  assert.ok(text, `${label} did not return text content`);

  return JSON.parse(text) as T;
}

main();
