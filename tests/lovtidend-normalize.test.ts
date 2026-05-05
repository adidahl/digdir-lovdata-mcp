import { describe, expect, it } from 'vitest';

import { normalizeLovtidendPublication } from '../scripts/lovtidend-normalize.js';

const LOVTIDEND_HTML = `<!DOCTYPE html><html lang="nb"><head><title>Lov om endringer i helsepersonelloven</title></head><body>
<header class="documentHeader"><dl class="data-document-key-info">
<dt class="legacyID">Datokode</dt><dd class="legacyID">LOV-2026-01-23-1</dd>
<dt class="dokid">DokumentID</dt><dd class="dokid">LTI/lov/2026-01-23-1</dd>
<dt class="ministry">Departement</dt><dd class="ministry"><ul><li>Helse- og omsorgsdepartementet</li></ul></dd>
<dt class="dateInForce">I kraft fra</dt><dd class="dateInForce">Kongen bestemmer</dd>
<dt class="changesToDocuments">Endrer</dt><dd class="changesToDocuments"><ul><li>lov/1999-07-02-64</li></ul></dd>
<dt class="basedOn">Hjemmel</dt><dd class="basedOn"><ul><li>lov/2024-12-20-96/§1</li></ul></dd>
<dt class="dateOfPublication">Kunngjort</dt><dd class="dateOfPublication">2026-01-23 11:40</dd>
<dt class="journalNumber">Journalnummer</dt><dd class="journalNumber">2026-0032</dd>
<dt class="titleShort">Korttittel</dt><dd class="titleShort">Endringslov til helsepersonelloven</dd>
<dt class="title">Tittel</dt><dd class="title">Lov om endringer i helsepersonelloven</dd>
<dt class="refid">RefID</dt><dd class="refid">lov/2026-01-23-1</dd>
</dl></header>
<main class="documentBody" data-lovdata-URL="LTI/lov/2026-01-23-1" id="dokument">
<h1>Lov om endringer i helsepersonelloven</h1>
<section class="section" id="kapittel-1">
<article class="document-change" data-document="lov/1999-07-02-64" id="kapittel-1-dokumentendring-1">
<article class="change" data-change-part="lov/1999-07-02-64/§21" id="kapittel-1-dokumentendring-1-endring-1"><article class="defaultP">§ 21 skal lyde:</article><article class="legalP">Taushetsplikt gjelder.</article></article>
<article class="change" data-repeal-part="lov/1999-07-02-64/§21a" id="kapittel-1-dokumentendring-1-endring-2"><article class="defaultP">§ 21 a oppheves.</article></article>
</article>
</section>
</main></body></html>`;

describe('Lovtidend normalization', () => {
  it('extracts publication metadata, references, and change parts', () => {
    const publication = normalizeLovtidendPublication(LOVTIDEND_HTML, {
      archiveFilename: 'lovtidend-avd1-2026.tar.bz2',
      archiveLastModified: '2026-05-05T01:31:00Z',
      sourceArchiveUrl:
        'https://api.lovdata.no/v1/publicData/get/lovtidend-avd1-2026.tar.bz2',
      xmlFilePath:
        '/workspace/data/extracted/publicData/lovtidend-avd1/lovtidend-avd1-2026/lti/2026/nl-20260123-001.xml',
    });

    expect(publication).toMatchObject({
      publication_id: 'LOV-2026-01-23-1',
      refid: 'lov/2026-01-23-1',
      dokid: 'LTI/lov/2026-01-23-1',
      title: 'Lov om endringer i helsepersonelloven',
      short_title: 'Endringslov til helsepersonelloven',
      document_kind: 'lov',
      department: 'Helse- og omsorgsdepartementet',
      publication_date: '2026-01-23T11:40:00',
      journal_number: '2026-0032',
      source_url: 'https://lovdata.no/dokument/LTI/lov/2026-01-23-1',
    });
    expect(publication.raw_xml_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(publication.references).toEqual([
      {
        reference_type: 'changes_to_document',
        target_ref: 'lov/1999-07-02-64',
        target_document_id: 'LOV-1999-07-02-64',
        target_kind: 'lov',
      },
      {
        reference_type: 'based_on',
        target_ref: 'lov/2024-12-20-96/§1',
        target_document_id: 'LOV-2024-12-20-96',
        target_kind: 'lov',
      },
    ]);
    expect(publication.change_parts).toMatchObject([
      {
        operation: 'change',
        target_ref: 'lov/1999-07-02-64/§21',
        target_document_id: 'LOV-1999-07-02-64',
      },
      {
        operation: 'repeal',
        target_ref: 'lov/1999-07-02-64/§21a',
        target_document_id: 'LOV-1999-07-02-64',
      },
    ]);
  });
});
