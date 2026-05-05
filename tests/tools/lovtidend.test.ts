import { describe, expect, it } from 'vitest';

import {
  callGetDocumentChangePublicationsTool,
  callGetLovtidendPublicationTool,
  callSearchLovtidendTool,
} from '../../src/tools/lovtidend.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('Lovtidend tools', () => {
  it('searches Lovtidend publication text and provenance metadata', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: Array<{
          publication_id: string;
          affected_refs: string[];
          operations: string[];
          snippet: string;
        }>;
      }>(
        callSearchLovtidendTool(db, {
          query: 'taushetsplikt',
          document_id: 'LOV-1999-07-02-64',
          operation: 'change',
          limit: 5,
        }),
      );

      expect(payload.results[0]).toMatchObject({
        publication_id: 'LOV-2026-01-23-1',
        affected_refs: ['lov/1999-07-02-64'],
      });
      expect(payload.results[0]?.operations).toContain('change');
      expect(payload.results[0]?.snippet.toLowerCase()).toContain('taushetsplikt');
    } finally {
      db.close();
    }
  });

  it('retrieves one Lovtidend publication with references and change parts', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          publication: { id: string; refid: string; full_text?: string };
          affected_documents: Array<{ target_ref: string }>;
          legal_bases: Array<{ target_ref: string }>;
          change_parts: Array<{ operation: string; target_ref: string }>;
        };
      }>(
        callGetLovtidendPublicationTool(db, {
          refid: 'forskrift/2026-01-05-1',
        }),
      );

      expect(payload.results.publication).toMatchObject({
        id: 'FOR-2026-01-05-1',
        refid: 'forskrift/2026-01-05-1',
      });
      expect(payload.results.publication.full_text).toBeUndefined();
      expect(payload.results.affected_documents[0]?.target_ref).toBe(
        'forskrift/2023-10-13-1632',
      );
      expect(payload.results.legal_bases[0]?.target_ref).toBe(
        'lov/2021-06-18-97/§9-11',
      );
      expect(payload.results.change_parts[0]).toMatchObject({
        operation: 'change',
        target_ref: 'forskrift/2023-10-13-1632/§4',
      });
    } finally {
      db.close();
    }
  });

  it('finds change publications for a provision-like target ref', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          document_id: string;
          publications: Array<{
            publication_id: string;
            operations: string[];
          }>;
        };
      }>(
        callGetDocumentChangePublicationsTool(db, {
          document_id: 'lov/1999-07-02-64',
          provision_ref: '§ 21 a',
        }),
      );

      expect(payload.results.document_id).toBe('LOV-1999-07-02-64');
      expect(payload.results.publications[0]).toMatchObject({
        publication_id: 'LOV-2026-01-23-1',
      });
      expect(payload.results.publications[0]?.operations).toContain('repeal');
    } finally {
      db.close();
    }
  });
});
