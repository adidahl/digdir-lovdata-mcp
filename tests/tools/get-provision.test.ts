import { describe, expect, it } from 'vitest';
import { callGetProvisionTool } from '../../src/tools/get-provision.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('get_provision', () => {
  it('normalizes section references and retrieves full provision text', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          found: boolean;
          document_id: string;
          provision_ref: string;
          heading: string;
          content: string;
        };
        _citation: unknown;
      }>(
        callGetProvisionTool(db, {
          document_id: 'LOV-2018-06-15-38',
          provision_ref: '5',
        }),
      );

      expect(payload.results.found).toBe(true);
      expect(payload.results.document_id).toBe('LOV-2018-06-15-38');
      expect(payload.results.provision_ref).toBe('§ 5');
      expect(payload.results.heading).toContain('Barns samtykke');
      expect(payload.results.content).toContain('Aldersgrensen er 13 år');
      expect(payload._citation).toBeDefined();
    } finally {
      db.close();
    }
  });

  it('reports a missing provision in an existing document', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          found: boolean;
          document_id: string;
          provision_ref: string;
          provision: null;
        };
      }>(
        callGetProvisionTool(db, {
          document_id: 'LOV-2018-06-15-38',
          section: '99',
        }),
      );

      expect(payload.results).toMatchObject({
        found: false,
        document_id: 'LOV-2018-06-15-38',
        provision_ref: '§ 99',
        provision: null,
      });
    } finally {
      db.close();
    }
  });

  it('reports a missing document before provision lookup', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          found: boolean;
          document_id: null;
          provision_ref: string;
          provision: null;
        };
        _metadata: { note?: string };
      }>(
        callGetProvisionTool(db, {
          document_id: 'LOV-2099-01-01-1',
          provision_ref: '1',
        }),
      );

      expect(payload.results).toMatchObject({
        found: false,
        document_id: null,
        provision_ref: '§ 1',
        provision: null,
      });
      expect(payload._metadata.note).toContain('No current publicData document');
    } finally {
      db.close();
    }
  });
});
