#!/usr/bin/env tsx

import Database from 'better-sqlite3';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  LovtidendChangeOperation,
  LovtidendDocumentKind,
  LovtidendReferenceType,
  NormalizedDocument,
  NormalizedDocumentType,
  NormalizedLovtidendPublication,
  NormalizedSection,
  SourceDataset,
} from '../src/types/normalized.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const NORMALIZED_DIR = path.join(PROJECT_ROOT, 'data', 'normalized');
const DB_PATH = process.env.DIGDIR_NORWEGIAN_LAW_BUILD_DB_PATH
  ? path.resolve(process.env.DIGDIR_NORWEGIAN_LAW_BUILD_DB_PATH)
  : path.join(PROJECT_ROOT, 'data', 'database.db');
const INCLUDE_LOVTIDEND =
  process.env.DIGDIR_NORWEGIAN_LAW_INCLUDE_LOVTIDEND !== '0';

const SOURCE_DATASETS = new Set<SourceDataset>([
  'gjeldende-lover',
  'gjeldende-sentrale-forskrifter',
]);

const DOCUMENT_TYPES = new Set<NormalizedDocumentType>(['lov', 'forskrift']);
const LOVTIDEND_DOCUMENT_KINDS = new Set<LovtidendDocumentKind>([
  'lov',
  'forskrift',
  'unknown',
]);
const LOVTIDEND_REFERENCE_TYPES = new Set<LovtidendReferenceType>([
  'changes_to_document',
  'based_on',
]);
const LOVTIDEND_CHANGE_OPERATIONS = new Set<LovtidendChangeOperation>([
  'change',
  'repeal',
  'add',
  'move',
]);

const SCHEMA = `
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

interface BuildStats {
  files: number;
  documents: number;
  provisions: number;
  lovtidendPublications: number;
  lovtidendReferences: number;
  lovtidendChangeParts: number;
}

async function main(): Promise<void> {
  const discoveredFiles = await collectJsonFiles(NORMALIZED_DIR);
  const files = selectCurrentBuildInputFiles(discoveredFiles);
  const lovtidendFiles = INCLUDE_LOVTIDEND
    ? selectLovtidendBuildInputFiles(discoveredFiles)
    : [];

  if (files.length === 0) {
    throw new Error(`No normalized JSON files found under ${NORMALIZED_DIR}`);
  }

  const documents = await readNormalizedDocuments(files);
  const lovtidendPublications = await readLovtidendPublications(lovtidendFiles);
  const stats = await rebuildDatabase(
    documents,
    lovtidendPublications,
    files.length + lovtidendFiles.length,
  );

  console.log(
    `Built ${path.relative(PROJECT_ROOT, DB_PATH)} from ${stats.files} file(s): ` +
      `${stats.documents} document(s), ${stats.provisions} provision(s), ` +
      `${stats.lovtidendPublications} Lovtidend publication(s), ` +
      `${stats.lovtidendChangeParts} change part(s).`,
  );
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectJsonFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith('.json')) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat().sort();
}

function selectCurrentBuildInputFiles(files: string[]): string[] {
  const normalizedDocuments = files.filter((file) => {
    const filename = path.basename(file);
    return (
      !isLovtidendNormalizedPath(file) &&
      !filename.endsWith('.sample.json') &&
      filename !== 'manifest.json' &&
      filename !== 'manifest.previous.json'
    );
  });
  const sampleDocuments = files.filter(
    (file) => !isLovtidendNormalizedPath(file) && file.endsWith('.sample.json'),
  );

  return normalizedDocuments.length > 0 ? normalizedDocuments : sampleDocuments;
}

function selectLovtidendBuildInputFiles(files: string[]): string[] {
  return files.filter((file) => {
    const filename = path.basename(file);
    return (
      isLovtidendNormalizedPath(file) &&
      !filename.endsWith('.sample.json') &&
      filename !== 'manifest.json' &&
      filename !== 'manifest.previous.json'
    );
  });
}

function isLovtidendNormalizedPath(file: string): boolean {
  return file.split(path.sep).includes('lovtidend-avd1');
}

async function readNormalizedDocuments(files: string[]): Promise<NormalizedDocument[]> {
  const documents: NormalizedDocument[] = [];

  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    documents.push(assertNormalizedDocument(parsed, file));
  }

  return documents;
}

async function readLovtidendPublications(
  files: string[],
): Promise<NormalizedLovtidendPublication[]> {
  const publications: NormalizedLovtidendPublication[] = [];

  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    publications.push(assertLovtidendPublication(parsed, file));
  }

  return publications;
}

async function rebuildDatabase(
  documents: NormalizedDocument[],
  lovtidendPublications: NormalizedLovtidendPublication[],
  fileCount: number,
): Promise<BuildStats> {
  await mkdir(path.dirname(DB_PATH), { recursive: true });
  await removeExistingDatabase();

  const db = new Database(DB_PATH);
  const builtAt = new Date().toISOString();

  try {
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);

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

    const insertAll = db.transaction((
      inputDocuments: NormalizedDocument[],
      inputLovtidendPublications: NormalizedLovtidendPublication[],
    ) => {
      let provisionCount = 0;
      let lovtidendReferenceCount = 0;
      let lovtidendChangePartCount = 0;

      for (const document of inputDocuments) {
        insertDocument.run({
          id: document.id,
          source_dataset: document.source_dataset,
          archive_filename: document.archive_filename,
          archive_last_modified: document.archive_last_modified,
          type: document.document_type,
          title: document.title,
          short_title: document.short_title ?? null,
          department: document.department ?? null,
          legal_area: document.legal_area ?? null,
          date_in_force: document.date_in_force ?? null,
          last_change_in_force: document.last_change_in_force ?? null,
          last_changed_by: document.last_changed_by ?? null,
          lovdata_refid: document.lovdata_refid ?? null,
          source_url: document.source_url,
          raw_xml_sha256: document.raw_xml_sha256,
          last_updated: builtAt,
        });

        for (const section of document.sections) {
          insertProvision.run({
            document_id: document.id,
            provision_ref: section.provision_ref,
            section_id: section.section_id,
            heading: section.heading ?? null,
            path: JSON.stringify(section.path),
            content: section.text,
            xml_path: section.xml_path ?? null,
          });
          provisionCount += 1;
        }
      }

      for (const publication of inputLovtidendPublications) {
        insertLovtidendPublication.run({
          id: publication.publication_id,
          refid: publication.refid,
          dokid: publication.dokid ?? null,
          title: publication.title,
          short_title: publication.short_title ?? null,
          document_kind: publication.document_kind,
          department: publication.department ?? null,
          date_in_force: publication.date_in_force ?? null,
          publication_date: publication.publication_date ?? null,
          journal_number: publication.journal_number ?? null,
          source_archive_filename: publication.source_archive_filename,
          archive_last_modified: publication.archive_last_modified,
          source_url: publication.source_url,
          source_xml_path: publication.source_xml_path ?? null,
          raw_xml_sha256: publication.raw_xml_sha256,
          full_text: publication.full_text,
          last_updated: builtAt,
        });

        for (const reference of publication.references) {
          insertLovtidendReference.run({
            publication_id: publication.publication_id,
            reference_type: reference.reference_type,
            target_ref: reference.target_ref,
            target_document_id: reference.target_document_id ?? null,
            target_kind: reference.target_kind ?? null,
          });
          lovtidendReferenceCount += 1;
        }

        for (const changePart of publication.change_parts) {
          insertLovtidendChangePart.run({
            publication_id: publication.publication_id,
            operation: changePart.operation,
            target_ref: changePart.target_ref,
            target_document_id: changePart.target_document_id ?? null,
            document_change_ref: changePart.document_change_ref ?? null,
            text: changePart.text,
            element_id: changePart.element_id ?? null,
            xml_path: changePart.xml_path ?? null,
          });
          lovtidendChangePartCount += 1;
        }

        insertLovtidendFts.run({
          publication_id: publication.publication_id,
          title: publication.title,
          short_title: publication.short_title ?? '',
          metadata: lovtidendFtsMetadata(publication),
          full_text: publication.full_text,
        });
      }

      insertMetadata.run('schema_version', '2');
      insertMetadata.run('built_at', builtAt);
      insertMetadata.run('builder', 'build-db.ts');
      insertMetadata.run('jurisdiction', 'NO');
      insertMetadata.run(
        'features',
        JSON.stringify([
          'core_legislation',
          'central_regulations',
          ...(inputLovtidendPublications.length > 0
            ? ['lovtidend_provenance']
            : []),
        ]),
      );
      insertMetadata.run('lovtidend_publications', String(inputLovtidendPublications.length));
      insertMetadata.run('lovtidend_references', String(lovtidendReferenceCount));
      insertMetadata.run('lovtidend_change_parts', String(lovtidendChangePartCount));

      return {
        provisionCount,
        lovtidendReferenceCount,
        lovtidendChangePartCount,
      };
    });

    const inserted = insertAll(documents, lovtidendPublications) as {
      provisionCount: number;
      lovtidendReferenceCount: number;
      lovtidendChangePartCount: number;
    };
    db.exec('ANALYZE');

    return {
      files: fileCount,
      documents: documents.length,
      provisions: inserted.provisionCount,
      lovtidendPublications: lovtidendPublications.length,
      lovtidendReferences: inserted.lovtidendReferenceCount,
      lovtidendChangeParts: inserted.lovtidendChangePartCount,
    };
  } finally {
    db.close();
  }
}

async function removeExistingDatabase(): Promise<void> {
  await Promise.all([
    rm(DB_PATH, { force: true }),
    rm(`${DB_PATH}-shm`, { force: true }),
    rm(`${DB_PATH}-wal`, { force: true }),
  ]);
}

function assertNormalizedDocument(
  value: unknown,
  filePath: string,
): NormalizedDocument {
  const document = assertRecord(value, filePath);
  const sourceDataset = requiredEnum(
    document,
    'source_dataset',
    SOURCE_DATASETS,
    filePath,
  );
  const documentType = requiredEnum(
    document,
    'document_type',
    DOCUMENT_TYPES,
    filePath,
  );
  const sections = document.sections;

  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error(`${filePath}: sections must be a non-empty array`);
  }

  return {
    id: requiredString(document, 'id', filePath),
    source_dataset: sourceDataset,
    archive_filename: requiredString(document, 'archive_filename', filePath),
    archive_last_modified: requiredString(
      document,
      'archive_last_modified',
      filePath,
    ),
    document_type: documentType,
    title: requiredString(document, 'title', filePath),
    short_title: optionalString(document, 'short_title', filePath),
    department: optionalString(document, 'department', filePath),
    legal_area: optionalString(document, 'legal_area', filePath),
    date_in_force: optionalString(document, 'date_in_force', filePath),
    last_change_in_force: optionalString(
      document,
      'last_change_in_force',
      filePath,
    ),
    last_changed_by: optionalString(document, 'last_changed_by', filePath),
    lovdata_refid: optionalString(document, 'lovdata_refid', filePath),
    source_url: requiredString(document, 'source_url', filePath),
    raw_xml_sha256: requiredSha256(document, 'raw_xml_sha256', filePath),
    sections: sections.map((section, index) =>
      assertNormalizedSection(section, `${filePath}: sections[${index}]`),
    ),
  };
}

function assertNormalizedSection(
  value: unknown,
  location: string,
): NormalizedSection {
  const section = assertRecord(value, location);
  const sectionPath = section.path;

  if (
    !Array.isArray(sectionPath) ||
    sectionPath.some((item) => typeof item !== 'string')
  ) {
    throw new Error(`${location}: path must be an array of strings`);
  }

  return {
    section_id: requiredString(section, 'section_id', location),
    provision_ref: requiredString(section, 'provision_ref', location),
    heading: optionalString(section, 'heading', location),
    path: sectionPath,
    text: requiredString(section, 'text', location),
    xml_path: optionalString(section, 'xml_path', location),
  };
}

function assertLovtidendPublication(
  value: unknown,
  filePath: string,
): NormalizedLovtidendPublication {
  const publication = assertRecord(value, filePath);
  const references = publication.references;
  const changeParts = publication.change_parts;

  if (!Array.isArray(references)) {
    throw new Error(`${filePath}: references must be an array`);
  }

  if (!Array.isArray(changeParts)) {
    throw new Error(`${filePath}: change_parts must be an array`);
  }

  return {
    publication_id: requiredString(publication, 'publication_id', filePath),
    refid: requiredString(publication, 'refid', filePath),
    dokid: optionalString(publication, 'dokid', filePath),
    title: requiredString(publication, 'title', filePath),
    short_title: optionalString(publication, 'short_title', filePath),
    document_kind: requiredEnum(
      publication,
      'document_kind',
      LOVTIDEND_DOCUMENT_KINDS,
      filePath,
    ),
    department: optionalString(publication, 'department', filePath),
    date_in_force: optionalString(publication, 'date_in_force', filePath),
    publication_date: optionalString(publication, 'publication_date', filePath),
    journal_number: optionalString(publication, 'journal_number', filePath),
    source_archive_filename: requiredString(
      publication,
      'source_archive_filename',
      filePath,
    ),
    archive_last_modified: requiredString(
      publication,
      'archive_last_modified',
      filePath,
    ),
    source_url: requiredString(publication, 'source_url', filePath),
    source_xml_path: optionalString(publication, 'source_xml_path', filePath),
    raw_xml_sha256: requiredSha256(publication, 'raw_xml_sha256', filePath),
    full_text: requiredString(publication, 'full_text', filePath),
    references: references.map((reference, index) =>
      assertLovtidendReference(reference, `${filePath}: references[${index}]`),
    ),
    change_parts: changeParts.map((changePart, index) =>
      assertLovtidendChangePart(changePart, `${filePath}: change_parts[${index}]`),
    ),
  };
}

function assertLovtidendReference(
  value: unknown,
  location: string,
): NormalizedLovtidendPublication['references'][number] {
  const reference = assertRecord(value, location);

  return {
    reference_type: requiredEnum(
      reference,
      'reference_type',
      LOVTIDEND_REFERENCE_TYPES,
      location,
    ),
    target_ref: requiredString(reference, 'target_ref', location),
    target_document_id: optionalString(reference, 'target_document_id', location),
    target_kind: optionalEnum(
      reference,
      'target_kind',
      LOVTIDEND_DOCUMENT_KINDS,
      location,
    ),
  };
}

function assertLovtidendChangePart(
  value: unknown,
  location: string,
): NormalizedLovtidendPublication['change_parts'][number] {
  const changePart = assertRecord(value, location);

  return {
    operation: requiredEnum(
      changePart,
      'operation',
      LOVTIDEND_CHANGE_OPERATIONS,
      location,
    ),
    target_ref: requiredString(changePart, 'target_ref', location),
    target_document_id: optionalString(changePart, 'target_document_id', location),
    document_change_ref: optionalString(changePart, 'document_change_ref', location),
    text: requiredString(changePart, 'text', location),
    element_id: optionalString(changePart, 'element_id', location),
    xml_path: optionalString(changePart, 'xml_path', location),
  };
}

function lovtidendFtsMetadata(publication: NormalizedLovtidendPublication): string {
  return [
    publication.refid,
    publication.dokid,
    publication.document_kind,
    publication.department,
    publication.publication_date,
    publication.journal_number,
    publication.references.map((reference) => reference.target_ref).join(' '),
    publication.change_parts
      .map((changePart) => `${changePart.operation} ${changePart.target_ref}`)
      .join(' '),
  ]
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' ');
}

function assertRecord(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${location}: expected a JSON object`);
  }

  return value as Record<string, unknown>;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  location: string,
): string {
  const value = record[key];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${location}: ${key} must be a non-empty string`);
  }

  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  location: string,
): string | undefined {
  const value = record[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${location}: ${key} must be a string when present`);
  }

  return value;
}

function requiredEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowedValues: Set<T>,
  location: string,
): T {
  const value = requiredString(record, key, location);

  if (!allowedValues.has(value as T)) {
    throw new Error(
      `${location}: ${key} must be one of ${[...allowedValues].join(', ')}`,
    );
  }

  return value as T;
}

function optionalEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowedValues: Set<T>,
  location: string,
): T | undefined {
  const value = optionalString(record, key, location);

  if (value === undefined) {
    return undefined;
  }

  if (!allowedValues.has(value as T)) {
    throw new Error(
      `${location}: ${key} must be one of ${[...allowedValues].join(', ')}`,
    );
  }

  return value as T;
}

function requiredSha256(
  record: Record<string, unknown>,
  key: string,
  location: string,
): string {
  const value = requiredString(record, key, location);

  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${location}: ${key} must be a lowercase SHA-256 hex digest`);
  }

  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
