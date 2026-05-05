import { describe, expect, it } from 'vitest';
import { callSearchLegislationTool } from '../../src/tools/search-legislation.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('search_legislation', () => {
  it('searches current provision text', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: Array<{
          document_id: string;
          provision_ref: string;
          snippet: string;
        }>;
        _metadata: unknown;
      }>(
        callSearchLegislationTool(db, {
          query: 'personopplysninger',
          limit: 3,
        }),
      );

      expect(payload.results.length).toBeGreaterThan(0);
      expect(payload.results[0]?.document_id).toMatch(/^(LOV|FOR)-/u);
      expect(payload.results[0]?.provision_ref).toMatch(/^§/u);
      expect(payload.results[0]?.snippet.toLowerCase()).toContain(
        'personopplysninger',
      );
      expect(payload._metadata).toBeDefined();
    } finally {
      db.close();
    }
  });

  it('returns an empty result set when no provision matches', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: unknown[];
        _metadata: unknown;
      }>(
        callSearchLegislationTool(db, {
          query: 'ikkeeksisterendesokeord',
          limit: 5,
        }),
      );

      expect(payload.results).toEqual([]);
      expect(payload._metadata).toBeDefined();
    } finally {
      db.close();
    }
  });
});
