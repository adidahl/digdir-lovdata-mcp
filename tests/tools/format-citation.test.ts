import { describe, expect, it } from 'vitest';
import { callFormatCitationTool } from '../../src/tools/format-citation.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('format_citation', () => {
  it('formats document IDs and provision references', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: { valid: boolean; formatted: string };
      }>(
        callFormatCitationTool(db, {
          document_id: 'lov-2018-06-15-38',
          provision_ref: '5',
          format: 'short',
        }),
      );

      expect(payload.results.valid).toBe(true);
      expect(payload.results.formatted).toBe('LOV-2018-06-15-38 § 5');
    } finally {
      db.close();
    }
  });

  it('rejects unsupported document ID families', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: { valid: boolean; formatted: string | null };
      }>(
        callFormatCitationTool(db, {
          document_id: 'SFS 2018:218',
          provision_ref: '5',
        }),
      );

      expect(payload.results.valid).toBe(false);
      expect(payload.results.formatted).toBeNull();
    } finally {
      db.close();
    }
  });
});
