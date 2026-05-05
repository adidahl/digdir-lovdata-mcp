import { describe, expect, it } from 'vitest';
import { callFindByTitleTool } from '../../src/tools/find-by-title.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('find_by_title', () => {
  it('resolves ASCII-ish title queries to stable Lovdata IDs', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: Array<{ id: string; short_title: string | null }>;
      }>(
        callFindByTitleTool(db, {
          query: 'miljoforskriften',
          limit: 3,
        }),
      );

      expect(payload.results[0]?.id).toBe('FOR-2024-01-01-1');
      expect(payload.results[0]?.short_title).toContain('Miljøforskriften');
    } finally {
      db.close();
    }
  });

  it('returns no candidates for unknown titles', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: unknown[];
        query_strategy: string;
      }>(
        callFindByTitleTool(db, {
          query: 'ukjent lovtittel',
          limit: 3,
        }),
      );

      expect(payload.results).toEqual([]);
      expect(payload.query_strategy).toBe('normalized_scan');
    } finally {
      db.close();
    }
  });
});
