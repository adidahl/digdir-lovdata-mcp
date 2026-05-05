import { describe, expect, it } from 'vitest';
import { validateCitation } from '../../src/citation/validator.js';
import { createTestDb } from '../fixtures/test-db.js';

describe('citation validator', () => {
  it('validates known documents and provisions', () => {
    const db = createTestDb();

    try {
      expect(validateCitation(db, 'LOV-2018-06-15-38')).toMatchObject({
        valid: true,
        document_exists: true,
        provision_exists: null,
        document_title:
          'Lov om behandling av personopplysninger (personopplysningsloven)',
        status: 'in_force',
        warnings: [],
      });

      expect(validateCitation(db, 'LOV-2018-06-15-38 § 5')).toMatchObject({
        valid: true,
        document_exists: true,
        provision_exists: true,
        warnings: [],
      });
    } finally {
      db.close();
    }
  });

  it('reports missing documents and provisions', () => {
    const db = createTestDb();

    try {
      expect(validateCitation(db, 'LOV-2099-01-01-1')).toMatchObject({
        valid: false,
        document_exists: false,
        provision_exists: null,
      });

      expect(validateCitation(db, 'LOV-2018-06-15-38 § 99')).toMatchObject({
        valid: false,
        document_exists: true,
        provision_exists: false,
      });
    } finally {
      db.close();
    }
  });
});
