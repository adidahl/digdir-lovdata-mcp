import { describe, expect, it } from 'vitest';
import { parseCitation } from '../../src/citation/parser.js';

describe('citation parser', () => {
  it('parses Lovdata IDs with optional chapter and provision references', () => {
    expect(parseCitation('lov-2018-06-15-38 kapittel 2 § 5')).toMatchObject({
      valid: true,
      document_id: 'LOV-2018-06-15-38',
      chapter: '2',
      provision_ref: '§ 5',
    });

    expect(parseCitation('FOR-2024-01-01-1 2')).toMatchObject({
      valid: true,
      document_id: 'FOR-2024-01-01-1',
      provision_ref: '§ 2',
    });
  });

  it.each([
    ['Swedish', 'SFS 2018:218 5 §'],
    ['EU', 'Regulation (EU) 2016/679'],
    ['case-law', 'HR-2020-1234-A'],
    ['preparatory-work', 'NOU 2009:1'],
  ])('rejects unsupported %s citation formats', (_kind, citation) => {
    const parsed = parseCitation(citation);

    expect(parsed.valid).toBe(false);
    expect(parsed.error).toBeDefined();
  });
});
