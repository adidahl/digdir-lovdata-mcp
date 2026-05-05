import { describe, expect, it } from 'vitest';
import { callListSourcesTool } from '../../src/tools/list-sources.js';
import { openTestDb, readToolJson } from './helpers.js';

describe('list_sources', () => {
  it('returns the Lovdata publicData source and included MVP datasets', () => {
    const db = openTestDb();

    try {
      const payload = readToolJson<{
        results: {
          source_count: number;
          items: Array<{
            id: string;
            publisher: string;
            license: { name: string; url: string };
            datasets: Array<{ id: string; archive_filename: string }>;
            verification_requirement: string;
          }>;
        };
        _metadata: unknown;
      }>(callListSourcesTool(db));

      expect(payload.results.source_count).toBe(1);
      expect(payload.results.items[0]).toMatchObject({
        id: 'lovdata-publicdata',
        publisher: 'Stiftelsen Lovdata',
        license: {
          name: 'Norsk lisens for offentlige data (NLOD) 2.0',
        },
      });
      expect(payload.results.items[0]?.datasets.map((dataset) => dataset.id)).toEqual([
        'gjeldende-lover',
        'gjeldende-sentrale-forskrifter',
        'lovtidend-avd1',
      ]);
      expect(payload.results.items[0]?.verification_requirement).toContain('Verify');
      expect(payload._metadata).toBeDefined();
    } finally {
      db.close();
    }
  });
});
