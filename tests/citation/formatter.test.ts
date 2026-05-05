import { describe, expect, it } from 'vitest';
import { formatParsedCitation } from '../../src/citation/formatter.js';
import { parseCitation } from '../../src/citation/parser.js';

describe('citation formatter', () => {
  it.each([
    ['short', 'LOV-2018-06-15-38 kapittel 2 § 5'],
    ['full', 'Lovdata LOV-2018-06-15-38 kapittel 2 § 5'],
    ['pinpoint', 'kapittel 2 § 5'],
  ] as const)('formats %s Lovdata citations', (format, expected) => {
    const parsed = parseCitation('LOV-2018-06-15-38 kapittel 2 § 5');

    expect(formatParsedCitation(parsed, format)).toBe(expected);
  });

  it('leaves invalid citations unchanged', () => {
    const parsed = parseCitation('SFS 2018:218 5 §');

    expect(formatParsedCitation(parsed, 'short')).toBe('SFS 2018:218 5 §');
  });
});
