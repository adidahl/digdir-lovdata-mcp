import { describe, expect, it } from 'vitest';
import { callGetDocumentTool } from '../../src/tools/get-document.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('get_document', () => {
  it('returns metadata and ordered sections for a current law', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          document: { id: string; title: string };
          sections: Array<{ provision_ref: string }>;
          total_sections: number;
          truncated: boolean;
        };
      }>(
        callGetDocumentTool(db, {
          document_id: 'LOV-2018-06-15-38',
          section_limit: 2,
        }),
      );

      expect(payload.results.document.id).toBe('LOV-2018-06-15-38');
      expect(payload.results.sections.map((section) => section.provision_ref)).toEqual([
        '§ 1',
        '§ 2',
      ]);
      expect(payload.results.total_sections).toBeGreaterThan(2);
      expect(payload.results.truncated).toBe(true);
    } finally {
      db.close();
    }
  });

  it('returns null with a warning note for a missing document', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: null;
        _metadata: { note?: string };
      }>(
        callGetDocumentTool(db, {
          document_id: 'LOV-2099-01-01-1',
        }),
      );

      expect(payload.results).toBeNull();
      expect(payload._metadata.note).toContain('No current publicData document');
    } finally {
      db.close();
    }
  });
});
