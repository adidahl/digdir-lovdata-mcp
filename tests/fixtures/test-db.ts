import Database from 'better-sqlite3';

const TEST_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  source_dataset TEXT NOT NULL
    CHECK(source_dataset IN ('gjeldende-lover', 'gjeldende-sentrale-forskrifter')),
  archive_filename TEXT NOT NULL,
  archive_last_modified TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('lov', 'forskrift')),
  title TEXT NOT NULL,
  short_title TEXT,
  department TEXT,
  legal_area TEXT,
  date_in_force TEXT,
  last_change_in_force TEXT,
  last_changed_by TEXT,
  lovdata_refid TEXT,
  source_url TEXT NOT NULL,
  raw_xml_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_force' CHECK(status IN ('in_force')),
  last_updated TEXT NOT NULL
);

CREATE INDEX idx_documents_type ON legal_documents(type);
CREATE INDEX idx_documents_source_dataset ON legal_documents(source_dataset);
CREATE INDEX idx_documents_department ON legal_documents(department);
CREATE INDEX idx_documents_legal_area ON legal_documents(legal_area);

CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  provision_ref TEXT NOT NULL,
  section_id TEXT NOT NULL,
  heading TEXT,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  xml_path TEXT,
  UNIQUE(document_id, provision_ref)
);

CREATE INDEX idx_provisions_doc ON legal_provisions(document_id);

CREATE VIRTUAL TABLE provisions_fts USING fts5(
  content,
  heading,
  content='legal_provisions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER provisions_ai AFTER INSERT ON legal_provisions BEGIN
  INSERT INTO provisions_fts(rowid, content, heading)
  VALUES (new.id, new.content, new.heading);
END;

CREATE TRIGGER provisions_ad AFTER DELETE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, heading)
  VALUES ('delete', old.id, old.content, old.heading);
END;

CREATE TRIGGER provisions_au AFTER UPDATE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, heading)
  VALUES ('delete', old.id, old.content, old.heading);
  INSERT INTO provisions_fts(rowid, content, heading)
  VALUES (new.id, new.content, new.heading);
END;

CREATE VIRTUAL TABLE document_title_fts USING fts5(
  document_id UNINDEXED,
  title,
  short_title,
  tokenize='unicode61'
);

CREATE TRIGGER documents_ai AFTER INSERT ON legal_documents BEGIN
  INSERT INTO document_title_fts(document_id, title, short_title)
  VALUES (new.id, new.title, new.short_title);
END;

CREATE TRIGGER documents_ad AFTER DELETE ON legal_documents BEGIN
  DELETE FROM document_title_fts WHERE document_id = old.id;
END;

CREATE TRIGGER documents_au AFTER UPDATE ON legal_documents BEGIN
  DELETE FROM document_title_fts WHERE document_id = old.id;
  INSERT INTO document_title_fts(document_id, title, short_title)
  VALUES (new.id, new.title, new.short_title);
END;

CREATE TABLE lovtidend_publications (
  id TEXT PRIMARY KEY,
  refid TEXT NOT NULL UNIQUE,
  dokid TEXT,
  title TEXT NOT NULL,
  short_title TEXT,
  document_kind TEXT NOT NULL CHECK(document_kind IN ('lov', 'forskrift', 'unknown')),
  department TEXT,
  date_in_force TEXT,
  publication_date TEXT,
  journal_number TEXT,
  source_archive_filename TEXT NOT NULL,
  archive_last_modified TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_xml_path TEXT,
  raw_xml_sha256 TEXT NOT NULL,
  full_text TEXT NOT NULL,
  last_updated TEXT NOT NULL
);

CREATE INDEX idx_lovtidend_publications_publication_date
  ON lovtidend_publications(publication_date);
CREATE INDEX idx_lovtidend_publications_refid ON lovtidend_publications(refid);
CREATE INDEX idx_lovtidend_publications_kind
  ON lovtidend_publications(document_kind);

CREATE TABLE lovtidend_references (
  id INTEGER PRIMARY KEY,
  publication_id TEXT NOT NULL
    REFERENCES lovtidend_publications(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL CHECK(reference_type IN ('changes_to_document', 'based_on')),
  target_ref TEXT NOT NULL,
  target_document_id TEXT,
  target_kind TEXT CHECK(target_kind IN ('lov', 'forskrift', 'unknown'))
);

CREATE INDEX idx_lovtidend_references_publication
  ON lovtidend_references(publication_id);
CREATE INDEX idx_lovtidend_references_target_ref
  ON lovtidend_references(target_ref);
CREATE INDEX idx_lovtidend_references_target_document
  ON lovtidend_references(target_document_id);

CREATE TABLE lovtidend_change_parts (
  id INTEGER PRIMARY KEY,
  publication_id TEXT NOT NULL
    REFERENCES lovtidend_publications(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK(operation IN ('change', 'repeal', 'add', 'move')),
  target_ref TEXT NOT NULL,
  target_document_id TEXT,
  document_change_ref TEXT,
  text TEXT NOT NULL,
  element_id TEXT,
  xml_path TEXT
);

CREATE INDEX idx_lovtidend_change_parts_publication
  ON lovtidend_change_parts(publication_id);
CREATE INDEX idx_lovtidend_change_parts_target_ref
  ON lovtidend_change_parts(target_ref);
CREATE INDEX idx_lovtidend_change_parts_target_document
  ON lovtidend_change_parts(target_document_id);
CREATE INDEX idx_lovtidend_change_parts_operation
  ON lovtidend_change_parts(operation);

CREATE VIRTUAL TABLE lovtidend_fts USING fts5(
  publication_id UNINDEXED,
  title,
  short_title,
  metadata,
  full_text,
  tokenize='unicode61'
);

CREATE TABLE db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const RAW_XML_SHA256 =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

interface TestDocument {
  id: string;
  source_dataset: string;
  archive_filename: string;
  archive_last_modified: string;
  type: string;
  title: string;
  short_title: string | null;
  department: string;
  legal_area: string;
  date_in_force: string;
  last_change_in_force: string;
  last_changed_by: string | null;
  lovdata_refid: string;
  source_url: string;
}

interface TestProvision {
  document_id: string;
  provision_ref: string;
  section_id: string;
  heading: string | null;
  path: string[];
  content: string;
  xml_path: string;
}

interface TestLovtidendPublication {
  id: string;
  refid: string;
  dokid: string;
  title: string;
  short_title: string | null;
  document_kind: string;
  department: string;
  date_in_force: string | null;
  publication_date: string;
  journal_number: string;
  source_archive_filename: string;
  archive_last_modified: string;
  source_url: string;
  source_xml_path: string;
  full_text: string;
}

interface TestLovtidendReference {
  publication_id: string;
  reference_type: string;
  target_ref: string;
  target_document_id: string;
  target_kind: string;
}

interface TestLovtidendChangePart {
  publication_id: string;
  operation: string;
  target_ref: string;
  target_document_id: string;
  document_change_ref: string;
  text: string;
  element_id: string;
  xml_path: string;
}

const TEST_DOCUMENTS: TestDocument[] = [
  {
    id: 'LOV-2018-06-15-38',
    source_dataset: 'gjeldende-lover',
    archive_filename: 'gjeldende-lover.tar.bz2',
    archive_last_modified: '2026-05-02T00:00:00.000Z',
    type: 'lov',
    title: 'Lov om behandling av personopplysninger (personopplysningsloven)',
    short_title: 'Personopplysningsloven',
    department: 'Justis- og beredskapsdepartementet',
    legal_area: 'Personvern',
    date_in_force: '2018-07-20',
    last_change_in_force: '2024-01-01',
    last_changed_by: 'lov/2023-12-20-108',
    lovdata_refid: 'lov/2018-06-15-38',
    source_url: 'https://lovdata.no/dokument/NL/lov/2018-06-15-38',
  },
  {
    id: 'FOR-2024-01-01-1',
    source_dataset: 'gjeldende-sentrale-forskrifter',
    archive_filename: 'gjeldende-sentrale-forskrifter.tar.bz2',
    archive_last_modified: '2026-05-02T00:00:00.000Z',
    type: 'forskrift',
    title: 'Forskrift om arbeidsmiljø for digitale tjenester i offentlig forvaltning',
    short_title: 'Miljøforskriften',
    department: 'Digitaliserings- og forvaltningsdepartementet',
    legal_area: 'Arbeidsmiljø',
    date_in_force: '2024-01-01',
    last_change_in_force: '2024-01-01',
    last_changed_by: null,
    lovdata_refid: 'forskrift/2024-01-01-1',
    source_url: 'https://lovdata.no/dokument/SF/forskrift/2024-01-01-1',
  },
];

const TEST_PROVISIONS: TestProvision[] = [
  {
    document_id: 'LOV-2018-06-15-38',
    provision_ref: '§ 1',
    section_id: 'PARAGRAF_1',
    heading: 'Gjennomføring av personvernforordningen',
    path: ['Kapittel 1'],
    content:
      'EØS-avtalen vedlegg XI nr. 5e gjelder som lov. Loven gjelder behandling av personopplysninger.',
    xml_path: '$/lovdata/main/section[1]/article',
  },
  {
    document_id: 'LOV-2018-06-15-38',
    provision_ref: '§ 2',
    section_id: 'PARAGRAF_2',
    heading: 'Saklig virkeområde og forholdet til andre lover',
    path: ['Kapittel 2'],
    content:
      'Loven og personvernforordningen gjelder ved behandling av personopplysninger.',
    xml_path: '$/lovdata/main/section[2]/article',
  },
  {
    document_id: 'LOV-2018-06-15-38',
    provision_ref: '§ 5',
    section_id: 'PARAGRAF_5',
    heading: 'Barns samtykke i forbindelse med informasjonssamfunnstjenester',
    path: ['Kapittel 2'],
    content:
      'Aldersgrensen er 13 år for barns samtykke i forbindelse med informasjonssamfunnstjenester.',
    xml_path: '$/lovdata/main/section[3]/article',
  },
  {
    document_id: 'FOR-2024-01-01-1',
    provision_ref: '§ 1',
    section_id: 'PARAGRAF_1',
    heading: 'Formål',
    path: [],
    content:
      'Forskriften skal legge til rette for sikre digitale tjenester i offentlig forvaltning.',
    xml_path: '$/lovdata/main/article[1]',
  },
  {
    document_id: 'FOR-2024-01-01-1',
    provision_ref: '§ 2',
    section_id: 'PARAGRAF_2',
    heading: 'Virkeområde',
    path: [],
    content:
      'Forskriften gjelder sentrale forvaltningsorganers digitale tjenester.',
    xml_path: '$/lovdata/main/article[2]',
  },
];

const TEST_LOVTIDEND_PUBLICATIONS: TestLovtidendPublication[] = [
  {
    id: 'LOV-2026-01-23-1',
    refid: 'lov/2026-01-23-1',
    dokid: 'LTI/lov/2026-01-23-1',
    title:
      'Lov om endringer i helsepersonelloven og pasientjournalloven mv. (taushetsplikt og tilgjengeliggjøring av pasientopplysninger)',
    short_title: 'Endringslov til helsepersonelloven og pasientjournalloven mv.',
    document_kind: 'lov',
    department: 'Helse- og omsorgsdepartementet',
    date_in_force: 'Kongen bestemmer',
    publication_date: '2026-01-23T11:40:00',
    journal_number: '2026-0032',
    source_archive_filename: 'lovtidend-avd1-2026.tar.bz2',
    archive_last_modified: '2026-05-05T01:31:00Z',
    source_url: 'https://lovdata.no/dokument/LTI/lov/2026-01-23-1',
    source_xml_path:
      'data/extracted/publicData/lovtidend-avd1/lovtidend-avd1-2026/lti/2026/nl-20260123-001.xml',
    full_text:
      'Lov om endringer i helsepersonelloven og pasientjournalloven mv. Taushetsplikt og tilgjengeliggjøring av pasientopplysninger. § 21 skal lyde. § 21 a oppheves.',
  },
  {
    id: 'FOR-2026-01-05-1',
    refid: 'forskrift/2026-01-05-1',
    dokid: 'LTI/forskrift/2026-01-05-1',
    title: 'Forskrift om endring i forskrift om fosterhjem',
    short_title: null,
    document_kind: 'forskrift',
    department: 'Barne- og familiedepartementet',
    date_in_force: '2026-01-05',
    publication_date: '2026-01-05T14:20:00',
    journal_number: '2026-0001',
    source_archive_filename: 'lovtidend-avd1-2026.tar.bz2',
    archive_last_modified: '2026-05-05T01:31:00Z',
    source_url: 'https://lovdata.no/dokument/LTI/forskrift/2026-01-05-1',
    source_xml_path:
      'data/extracted/publicData/lovtidend-avd1/lovtidend-avd1-2026/lti/2026/sf-20260105-0001.xml',
    full_text:
      'Forskrift om endring i forskrift om fosterhjem. Endrer forskrift om fosterhjem med hjemmel i barnevernsloven.',
  },
];

const TEST_LOVTIDEND_REFERENCES: TestLovtidendReference[] = [
  {
    publication_id: 'LOV-2026-01-23-1',
    reference_type: 'changes_to_document',
    target_ref: 'lov/1999-07-02-64',
    target_document_id: 'LOV-1999-07-02-64',
    target_kind: 'lov',
  },
  {
    publication_id: 'FOR-2026-01-05-1',
    reference_type: 'changes_to_document',
    target_ref: 'forskrift/2023-10-13-1632',
    target_document_id: 'FOR-2023-10-13-1632',
    target_kind: 'forskrift',
  },
  {
    publication_id: 'FOR-2026-01-05-1',
    reference_type: 'based_on',
    target_ref: 'lov/2021-06-18-97/§9-11',
    target_document_id: 'LOV-2021-06-18-97',
    target_kind: 'lov',
  },
];

const TEST_LOVTIDEND_CHANGE_PARTS: TestLovtidendChangePart[] = [
  {
    publication_id: 'LOV-2026-01-23-1',
    operation: 'change',
    target_ref: 'lov/1999-07-02-64/§21',
    target_document_id: 'LOV-1999-07-02-64',
    document_change_ref: 'lov/1999-07-02-64',
    text: '§ 21 skal lyde: Helsepersonells taushetsplikt.',
    element_id: 'kapittel-1-dokumentendring-1-endring-2',
    xml_path: 'article#kapittel-1-dokumentendring-1-endring-2',
  },
  {
    publication_id: 'LOV-2026-01-23-1',
    operation: 'repeal',
    target_ref: 'lov/1999-07-02-64/§21a',
    target_document_id: 'LOV-1999-07-02-64',
    document_change_ref: 'lov/1999-07-02-64',
    text: '§ 21 a oppheves.',
    element_id: 'kapittel-1-dokumentendring-1-endring-3',
    xml_path: 'article#kapittel-1-dokumentendring-1-endring-3',
  },
  {
    publication_id: 'FOR-2026-01-05-1',
    operation: 'change',
    target_ref: 'forskrift/2023-10-13-1632/§4',
    target_document_id: 'FOR-2023-10-13-1632',
    document_change_ref: 'forskrift/2023-10-13-1632',
    text: '§ 4 skal lyde.',
    element_id: 'kapittel-1-dokumentendring-1-endring-1',
    xml_path: 'article#kapittel-1-dokumentendring-1-endring-1',
  },
];

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  const lastUpdated = '2026-05-02T00:00:00.000Z';

  db.pragma('foreign_keys = ON');
  db.exec(TEST_SCHEMA);

  const insertDocument = db.prepare(`
    INSERT INTO legal_documents (
      id,
      source_dataset,
      archive_filename,
      archive_last_modified,
      type,
      title,
      short_title,
      department,
      legal_area,
      date_in_force,
      last_change_in_force,
      last_changed_by,
      lovdata_refid,
      source_url,
      raw_xml_sha256,
      status,
      last_updated
    ) VALUES (
      @id,
      @source_dataset,
      @archive_filename,
      @archive_last_modified,
      @type,
      @title,
      @short_title,
      @department,
      @legal_area,
      @date_in_force,
      @last_change_in_force,
      @last_changed_by,
      @lovdata_refid,
      @source_url,
      @raw_xml_sha256,
      'in_force',
      @last_updated
    )
  `);

  const insertProvision = db.prepare(`
    INSERT INTO legal_provisions (
      document_id,
      provision_ref,
      section_id,
      heading,
      path,
      content,
      xml_path
    ) VALUES (
      @document_id,
      @provision_ref,
      @section_id,
      @heading,
      @path,
      @content,
      @xml_path
    )
  `);

  const insertMetadata = db.prepare(`
    INSERT INTO db_metadata (key, value) VALUES (?, ?)
  `);
  const insertLovtidendPublication = db.prepare(`
    INSERT INTO lovtidend_publications (
      id,
      refid,
      dokid,
      title,
      short_title,
      document_kind,
      department,
      date_in_force,
      publication_date,
      journal_number,
      source_archive_filename,
      archive_last_modified,
      source_url,
      source_xml_path,
      raw_xml_sha256,
      full_text,
      last_updated
    ) VALUES (
      @id,
      @refid,
      @dokid,
      @title,
      @short_title,
      @document_kind,
      @department,
      @date_in_force,
      @publication_date,
      @journal_number,
      @source_archive_filename,
      @archive_last_modified,
      @source_url,
      @source_xml_path,
      @raw_xml_sha256,
      @full_text,
      @last_updated
    )
  `);
  const insertLovtidendReference = db.prepare(`
    INSERT INTO lovtidend_references (
      publication_id,
      reference_type,
      target_ref,
      target_document_id,
      target_kind
    ) VALUES (
      @publication_id,
      @reference_type,
      @target_ref,
      @target_document_id,
      @target_kind
    )
  `);
  const insertLovtidendChangePart = db.prepare(`
    INSERT INTO lovtidend_change_parts (
      publication_id,
      operation,
      target_ref,
      target_document_id,
      document_change_ref,
      text,
      element_id,
      xml_path
    ) VALUES (
      @publication_id,
      @operation,
      @target_ref,
      @target_document_id,
      @document_change_ref,
      @text,
      @element_id,
      @xml_path
    )
  `);
  const insertLovtidendFts = db.prepare(`
    INSERT INTO lovtidend_fts (
      publication_id,
      title,
      short_title,
      metadata,
      full_text
    ) VALUES (
      @publication_id,
      @title,
      @short_title,
      @metadata,
      @full_text
    )
  `);

  const insertAll = db.transaction(() => {
    for (const document of TEST_DOCUMENTS) {
      insertDocument.run({
        ...document,
        raw_xml_sha256: RAW_XML_SHA256,
        last_updated: lastUpdated,
      });
    }

    for (const provision of TEST_PROVISIONS) {
      insertProvision.run({
        ...provision,
        path: JSON.stringify(provision.path),
      });
    }

    for (const publication of TEST_LOVTIDEND_PUBLICATIONS) {
      insertLovtidendPublication.run({
        ...publication,
        raw_xml_sha256: RAW_XML_SHA256,
        last_updated: lastUpdated,
      });
      insertLovtidendFts.run({
        publication_id: publication.id,
        title: publication.title,
        short_title: publication.short_title ?? '',
        metadata: [
          publication.refid,
          publication.dokid,
          publication.document_kind,
          publication.department,
          publication.publication_date,
          publication.journal_number,
        ].join(' '),
        full_text: publication.full_text,
      });
    }

    for (const reference of TEST_LOVTIDEND_REFERENCES) {
      insertLovtidendReference.run(reference);
    }

    for (const changePart of TEST_LOVTIDEND_CHANGE_PARTS) {
      insertLovtidendChangePart.run(changePart);
    }

    insertMetadata.run('schema_version', '2');
    insertMetadata.run('built_at', lastUpdated);
    insertMetadata.run('builder', 'test-db.ts');
    insertMetadata.run('jurisdiction', 'NO');
    insertMetadata.run(
      'features',
      JSON.stringify([
        'core_legislation',
        'central_regulations',
        'lovtidend_provenance',
      ]),
    );
  });

  insertAll();
  db.exec('ANALYZE');

  return db;
}
