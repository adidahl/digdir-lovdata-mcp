import { describe, expect, it } from 'vitest';
import { callCheckCurrencyTool } from '../../src/tools/check-currency.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('check_currency', () => {
  it('checks current publicData presence without implying history', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          document_exists: boolean;
          is_current: boolean;
          historical_versions_available: boolean;
          provision_exists: boolean;
        };
      }>(
        callCheckCurrencyTool(db, {
          document_id: 'LOV-2018-06-15-38',
          provision_ref: '§ 5',
        }),
      );

      expect(payload.results.document_exists).toBe(true);
      expect(payload.results.is_current).toBe(true);
      expect(payload.results.provision_exists).toBe(true);
      expect(payload.results.historical_versions_available).toBe(false);
    } finally {
      db.close();
    }
  });

  it('reports missing provisions separately from existing documents', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          document_exists: boolean;
          is_current: boolean;
          provision_ref: string;
          provision_exists: boolean;
        };
      }>(
        callCheckCurrencyTool(db, {
          document_id: 'LOV-2018-06-15-38',
          provision_ref: '99',
        }),
      );

      expect(payload.results.document_exists).toBe(true);
      expect(payload.results.is_current).toBe(true);
      expect(payload.results.provision_ref).toBe('§ 99');
      expect(payload.results.provision_exists).toBe(false);
    } finally {
      db.close();
    }
  });

  it('reports missing documents as not current', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          document_exists: boolean;
          is_current: boolean;
          document_id: null;
          requested_document_id: string;
        };
      }>(
        callCheckCurrencyTool(db, {
          document_id: 'LOV-2099-01-01-1',
        }),
      );

      expect(payload.results.document_exists).toBe(false);
      expect(payload.results.is_current).toBe(false);
      expect(payload.results.document_id).toBeNull();
      expect(payload.results.requested_document_id).toBe('LOV-2099-01-01-1');
    } finally {
      db.close();
    }
  });
});
