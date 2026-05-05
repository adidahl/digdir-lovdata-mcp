import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeXmlDocument } from '../scripts/publicdata-normalize.js';

describe('publicData normalization', () => {
  it('normalizes Lovdata XML metadata and provisions', async () => {
    const fixturePath = path.resolve(
      'tests/fixtures/publicdata/gjeldende-lover/nl/lov-2018-06-15-38.fixture.xml',
    );
    const xml = await readFile(fixturePath, 'utf8');

    const document = normalizeXmlDocument(xml, {
      sourceDataset: 'gjeldende-lover',
      archiveFilename: 'gjeldende-lover.tar.bz2',
      archiveLastModified: '2026-05-02T00:00:00.000Z',
      xmlFilePath: fixturePath,
    });

    expect(document).toMatchObject({
      id: 'LOV-2018-06-15-38',
      source_dataset: 'gjeldende-lover',
      archive_filename: 'gjeldende-lover.tar.bz2',
      archive_last_modified: '2026-05-02T00:00:00.000Z',
      document_type: 'lov',
      title: 'Lov om behandling av personopplysninger (personopplysningsloven)',
      short_title: 'Personopplysningsloven',
      department: 'Justis- og beredskapsdepartementet',
      legal_area: 'Personvern',
      date_in_force: '2018-07-20',
      last_change_in_force: '2024-01-01',
      last_changed_by: 'lov/2023-12-20-108',
      lovdata_refid: 'lov/2018-06-15-38',
      source_url: 'https://lovdata.no/dokument/NL/lov/2018-06-15-38',
    });

    expect(document.raw_xml_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(document.sections).toHaveLength(2);
    expect(document.sections[0]).toMatchObject({
      section_id: 'PARAGRAF_1',
      provision_ref: '§ 1',
      heading: 'Gjennomføring av personvernforordningen',
      path: ['Kapittel 1'],
      text: 'EØS-avtalen vedlegg XI nr. 5e gjelder som lov.',
    });
    expect(document.sections[1]).toMatchObject({
      section_id: 'PARAGRAF_2',
      provision_ref: '§ 2',
      heading: 'Saklig virkeområde og forholdet til andre lover',
      path: ['Kapittel 2'],
      text: 'Loven og personvernforordningen gjelder ved behandling av personopplysninger.',
    });
  });

  it('normalizes current laws and central regulations to the same JSON shape', async () => {
    const lawFixturePath = path.resolve(
      'tests/fixtures/publicdata/gjeldende-lover/nl/lov-2018-06-15-38.fixture.xml',
    );
    const regulationFixturePath = path.resolve(
      'tests/fixtures/publicdata/gjeldende-sentrale-forskrifter/sf/forskrift-2024-01-01-1.fixture.xml',
    );
    const lawDocument = normalizeXmlDocument(
      await readFile(lawFixturePath, 'utf8'),
      {
        sourceDataset: 'gjeldende-lover',
        archiveFilename: 'gjeldende-lover.tar.bz2',
        archiveLastModified: '2026-05-02T00:00:00.000Z',
        xmlFilePath: lawFixturePath,
      },
    );
    const regulationDocument = normalizeXmlDocument(
      await readFile(regulationFixturePath, 'utf8'),
      {
        sourceDataset: 'gjeldende-sentrale-forskrifter',
        archiveFilename: 'gjeldende-sentrale-forskrifter.tar.bz2',
        archiveLastModified: '2026-05-02T00:00:00.000Z',
        xmlFilePath: regulationFixturePath,
      },
    );

    expect(Object.keys(regulationDocument).sort()).toEqual(
      Object.keys(lawDocument).sort(),
    );
    expect(Object.keys(regulationDocument.sections[0] ?? {}).sort()).toEqual(
      Object.keys(lawDocument.sections[0] ?? {}).sort(),
    );
    expect(regulationDocument).toMatchObject({
      id: 'FOR-2024-01-01-1',
      source_dataset: 'gjeldende-sentrale-forskrifter',
      archive_filename: 'gjeldende-sentrale-forskrifter.tar.bz2',
      archive_last_modified: '2026-05-02T00:00:00.000Z',
      document_type: 'forskrift',
      title:
        'Forskrift om arbeidsmiljø for digitale tjenester i offentlig forvaltning',
      short_title: 'Miljøforskriften',
      department: 'Digitaliserings- og forvaltningsdepartementet',
      legal_area: 'Arbeidsmiljø',
      date_in_force: '2024-01-01',
      last_change_in_force: '2024-01-01',
      lovdata_refid: 'forskrift/2024-01-01-1',
      source_url:
        'https://lovdata.no/dokument/SF/forskrift/2024-01-01-1',
    });
    expect(regulationDocument.raw_xml_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(regulationDocument.sections).toHaveLength(2);
  });
});
