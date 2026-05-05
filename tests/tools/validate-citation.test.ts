import { describe, expect, it } from 'vitest';
import { callValidateCitationTool } from '../../src/tools/validate-citation.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('validate_citation', () => {
  it('validates supported Lovdata current-law citations', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          valid: boolean;
          document_exists: boolean;
          provision_exists: boolean;
        };
      }>(
        callValidateCitationTool(db, {
          citation: 'LOV-2018-06-15-38 § 5',
        }),
      );

      expect(payload.results.valid).toBe(true);
      expect(payload.results.document_exists).toBe(true);
      expect(payload.results.provision_exists).toBe(true);
    } finally {
      db.close();
    }
  });

  it('rejects unsupported Swedish citations', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: { valid: boolean; warnings: string[] };
      }>(
        callValidateCitationTool(db, {
          citation: 'SFS 2018:218 5 §',
        }),
      );

      expect(payload.results.valid).toBe(false);
      expect(payload.results.warnings.join(' ')).toContain('Swedish');
    } finally {
      db.close();
    }
  });

  it.each([
    ['EU', 'Regulation (EU) 2016/679'],
    ['case-law', 'HR-2020-1234-A'],
    ['preparatory-work', 'Prop. 56 L (2017-2018)'],
  ])('rejects unsupported %s citations', (_kind, citation) => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: { valid: boolean; warnings: string[] };
      }>(
        callValidateCitationTool(db, {
          citation,
        }),
      );

      expect(payload.results.valid).toBe(false);
      expect(payload.results.warnings).not.toEqual([]);
    } finally {
      db.close();
    }
  });

  it('reports missing provisions in known documents', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          valid: boolean;
          document_exists: boolean;
          provision_exists: boolean;
          warnings: string[];
        };
      }>(
        callValidateCitationTool(db, {
          citation: 'LOV-2018-06-15-38 § 99',
        }),
      );

      expect(payload.results.valid).toBe(false);
      expect(payload.results.document_exists).toBe(true);
      expect(payload.results.provision_exists).toBe(false);
      expect(payload.results.warnings.join(' ')).toContain('Provision');
    } finally {
      db.close();
    }
  });
});
