import { describe, expect, it } from 'vitest';
import { callAboutTool } from '../../src/tools/about.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('about', () => {
  it('returns server metadata, corpus counts, freshness, and disclaimers', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          name: string;
          version: string;
          jurisdiction: string;
          database: { path: string; schema_version: string | null };
          counts: {
            documents: number;
            provisions: number;
            by_document_type: Record<string, number>;
            by_source_dataset: Record<string, number>;
            lovtidend_publications: number;
            lovtidend_change_parts: number;
            lovtidend_change_parts_by_operation: Record<string, number>;
          };
          source_warning: string;
          legal_disclaimer: string;
        };
        _metadata: unknown;
      }>(
        callAboutTool({
          db,
          dbPath: ':memory:',
          serverVersion: '0.1.0-test',
        }),
      );

      expect(payload.results).toMatchObject({
        name: 'digdir-norwegian-law',
        version: '0.1.0-test',
        jurisdiction: 'NO',
        database: {
          path: ':memory:',
          schema_version: '2',
        },
      });
      expect(payload.results.counts.documents).toBe(2);
      expect(payload.results.counts.provisions).toBe(5);
      expect(payload.results.counts.by_document_type).toEqual({
        forskrift: 1,
        lov: 1,
      });
      expect(payload.results.counts.by_source_dataset).toEqual({
        'gjeldende-lover': 1,
        'gjeldende-sentrale-forskrifter': 1,
      });
      expect(payload.results.counts.lovtidend_publications).toBe(2);
      expect(payload.results.counts.lovtidend_change_parts).toBe(3);
      expect(payload.results.counts.lovtidend_change_parts_by_operation).toEqual({
        change: 2,
        repeal: 1,
      });
      expect(payload.results.source_warning).toContain('Verify');
      expect(payload.results.legal_disclaimer).toContain('does not provide legal advice');
      expect(payload._metadata).toBeDefined();
    } finally {
      db.close();
    }
  });
});
