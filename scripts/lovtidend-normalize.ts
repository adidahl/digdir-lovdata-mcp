#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

import type {
  LovtidendChangeOperation,
  LovtidendDocumentKind,
  LovtidendReferenceType,
  NormalizedLovtidendChangePart,
  NormalizedLovtidendPublication,
  NormalizedLovtidendReference,
} from '../src/types/normalized.js';
import {
  LOVTIDEND_AVD1_DATASET,
  PUBLICDATA_GET_BASE_URL,
  archiveStem,
  lovtidendNormalizedDir,
  pathExists,
  projectPath,
  readManifest,
  writeJson,
  type PublicDataManifestEntry,
} from './lib/publicdata.js';

interface CliOptions {
  inputDir: string;
  outputDir: string;
  limit?: number;
}

interface ArchiveContext {
  archiveFilename: string;
  archiveLastModified: string;
  archiveSizeBytes?: number;
  sourceArchiveUrl: string;
  extractedPath?: string;
}

interface NormalizeContext extends ArchiveContext {
  xmlFilePath?: string;
}

interface LovtidendManifestPublication {
  publication_id: string;
  refid: string;
  dokid?: string;
  title: string;
  short_title?: string;
  document_kind: LovtidendDocumentKind;
  publication_date?: string;
  journal_number?: string;
  source_archive_filename: string;
  archive_size_bytes?: number;
  archive_last_modified: string;
  source_xml_path?: string;
  normalized_json_path: string;
  raw_xml_sha256: string;
  references: number;
  change_parts: number;
}

export interface LovtidendManifest {
  generatedAt: string;
  source: string;
  publications: Record<string, LovtidendManifestPublication>;
}

const CHANGE_ATTRIBUTE_OPERATIONS: Array<{
  attribute: string;
  operation: LovtidendChangeOperation;
}> = [
  { attribute: 'data-change-part', operation: 'change' },
  { attribute: 'data-repeal-part', operation: 'repeal' },
  { attribute: 'data-add-new-part', operation: 'add' },
  { attribute: 'data-move-part', operation: 'move' },
];

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readManifest();
  const archiveContexts = discoverArchiveContexts(
    options.inputDir,
    manifest?.files,
  );
  const manifestFilePath = path.join(options.outputDir, 'manifest.json');
  const previousManifestFilePath = path.join(options.outputDir, 'manifest.previous.json');

  if (archiveContexts.length === 0) {
    throw new Error(`No Lovtidend avd. I archives found under ${options.inputDir}`);
  }

  const previousManifest =
    (await readLovtidendManifest(manifestFilePath)) ??
    (await readLovtidendManifestFromPublications(options.outputDir));
  const publications: Record<string, LovtidendManifestPublication> = {};
  let normalizedCount = 0;

  if (options.limit === undefined) {
    await rm(options.outputDir, { recursive: true, force: true });
  }

  await mkdir(options.outputDir, { recursive: true });

  for (const archive of archiveContexts) {
    if (!archive.extractedPath || !(await pathExists(archive.extractedPath))) {
      continue;
    }

    const files = await collectXmlFiles(archive.extractedPath);
    const remainingLimit =
      options.limit === undefined ? files.length : options.limit - normalizedCount;
    const selectedFiles = files.slice(0, Math.max(0, remainingLimit));

    for (const file of selectedFiles) {
      const xml = await readFile(file, 'utf8');
      const publication = normalizeLovtidendPublication(xml, {
        ...archive,
        archiveLastModified:
          archive.archiveLastModified || (await stat(file)).mtime.toISOString(),
        xmlFilePath: file,
      });
      const outputPath = path.join(
        options.outputDir,
        `${slugify(publication.publication_id)}.json`,
      );

      await writeFile(outputPath, `${JSON.stringify(publication, null, 2)}\n`, 'utf8');
      publications[publication.publication_id] = {
        publication_id: publication.publication_id,
        refid: publication.refid,
        ...(publication.dokid ? { dokid: publication.dokid } : {}),
        title: publication.title,
        ...(publication.short_title
          ? { short_title: publication.short_title }
          : {}),
        document_kind: publication.document_kind,
        ...(publication.publication_date
          ? { publication_date: publication.publication_date }
          : {}),
        ...(publication.journal_number
          ? { journal_number: publication.journal_number }
          : {}),
        source_archive_filename: publication.source_archive_filename,
        ...(archive.archiveSizeBytes !== undefined
          ? { archive_size_bytes: archive.archiveSizeBytes }
          : {}),
        archive_last_modified: publication.archive_last_modified,
        source_xml_path: publication.source_xml_path,
        normalized_json_path: path.relative(projectPath(), outputPath),
        raw_xml_sha256: publication.raw_xml_sha256,
        references: publication.references.length,
        change_parts: publication.change_parts.length,
      };
      normalizedCount += 1;
    }

    if (options.limit !== undefined && normalizedCount >= options.limit) {
      break;
    }
  }

  if (previousManifest) {
    await writeJson(previousManifestFilePath, previousManifest);
  }

  await writeJson(manifestFilePath, {
    generatedAt: new Date().toISOString(),
    source: manifest?.source ?? 'Lovdata publicData extracted Lovtidend archives',
    publications,
  } satisfies LovtidendManifest);

  console.log(`Normalized ${normalizedCount} Lovtidend publication(s).`);
  console.log(`Wrote ${manifestFilePath}`);
}

export function normalizeLovtidendPublication(
  html: string,
  context: NormalizeContext,
): NormalizedLovtidendPublication {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const main = document.querySelector('main.documentBody') ?? document.body;
  const legacyId = textFromDataList(document, 'legacyID');
  const dokid = textFromDataList(document, 'dokid');
  const refid = textFromDataList(document, 'refid') ?? refidFromDokid(dokid);

  if (!refid) {
    throw new Error(`${context.xmlFilePath ?? 'Lovtidend document'}: missing RefID`);
  }

  const publicationId =
    normalizePublicationId(legacyId) ??
    normalizePublicationId(refid) ??
    idFromFilePath(context.xmlFilePath) ??
    slugify(refid).toUpperCase();
  const title =
    textFromDataList(document, 'title') ??
    textFromSelector(document, 'main.documentBody > h1') ??
    textFromSelector(document, 'head > title') ??
    publicationId;
  const fullText = domText(main);

  return {
    publication_id: publicationId,
    refid,
    ...(dokid ? { dokid } : {}),
    title,
    short_title: textFromDataList(document, 'titleShort'),
    document_kind: documentKindFromRef(refid, dokid),
    department: textListFromDataList(document, 'ministry'),
    date_in_force: textFromDataList(document, 'dateInForce'),
    publication_date: normalizePublicationDate(
      textFromDataList(document, 'dateOfPublication'),
    ),
    journal_number: textFromDataList(document, 'journalNumber'),
    source_archive_filename: context.archiveFilename,
    archive_last_modified: context.archiveLastModified,
    source_url: sourceUrlFor(dokid, refid),
    source_xml_path: context.xmlFilePath
      ? path.relative(projectPath(), context.xmlFilePath)
      : undefined,
    raw_xml_sha256: createHash('sha256').update(html).digest('hex'),
    full_text: fullText,
    references: [
      ...extractReferenceList(document, 'changesToDocuments', 'changes_to_document'),
      ...extractReferenceList(document, 'basedOn', 'based_on'),
    ],
    change_parts: extractChangeParts(document),
  };
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputDir: projectPath('data', 'extracted', 'publicData', LOVTIDEND_AVD1_DATASET),
    outputDir: lovtidendNormalizedDir(),
  };

  for (const arg of argv) {
    if (arg.startsWith('--input=')) {
      options.inputDir = path.resolve(arg.slice('--input='.length));
      continue;
    }

    if (arg.startsWith('--output=')) {
      options.outputDir = path.resolve(arg.slice('--output='.length));
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const limit = Number(arg.slice('--limit='.length));
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('--limit must be a positive integer');
      }
      options.limit = limit;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function discoverArchiveContexts(
  inputDir: string,
  manifestFiles?: Record<string, PublicDataManifestEntry>,
): ArchiveContext[] {
  const manifestArchives = Object.values(manifestFiles ?? {})
    .filter((entry) => entry.dataset === LOVTIDEND_AVD1_DATASET)
    .map((entry) => ({
      archiveFilename: entry.filename,
      archiveLastModified: entry.lastModified ?? entry.downloadedAt,
      archiveSizeBytes: entry.sizeBytes,
      sourceArchiveUrl: `${PUBLICDATA_GET_BASE_URL}/${encodeURIComponent(entry.filename)}`,
      extractedPath: entry.extractedPath,
    }));

  if (manifestArchives.length > 0) {
    return manifestArchives.sort((a, b) =>
      a.archiveFilename.localeCompare(b.archiveFilename),
    );
  }

  return [
    {
      archiveFilename: `${path.basename(inputDir)}.tar.bz2`,
      archiveLastModified: new Date(0).toISOString(),
      sourceArchiveUrl: '',
      extractedPath: inputDir,
    },
  ];
}

async function collectXmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectXmlFiles(entryPath);
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat().sort();
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectJsonFiles(entryPath);
      }

      if (
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        entry.name !== 'manifest.json' &&
        entry.name !== 'manifest.previous.json'
      ) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat().sort();
}

async function readLovtidendManifest(
  filePath: string,
): Promise<LovtidendManifest | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  return JSON.parse(await readFile(filePath, 'utf8')) as LovtidendManifest;
}

async function readLovtidendManifestFromPublications(
  outputDir: string,
): Promise<LovtidendManifest | undefined> {
  const files = await collectJsonFiles(outputDir);

  if (files.length === 0) {
    return undefined;
  }

  const publications: Record<string, LovtidendManifestPublication> = {};

  for (const file of files) {
    const publication = JSON.parse(
      await readFile(file, 'utf8'),
    ) as NormalizedLovtidendPublication;
    publications[publication.publication_id] = {
      publication_id: publication.publication_id,
      refid: publication.refid,
      ...(publication.dokid ? { dokid: publication.dokid } : {}),
      title: publication.title,
      ...(publication.short_title
        ? { short_title: publication.short_title }
        : {}),
      document_kind: publication.document_kind,
      ...(publication.publication_date
        ? { publication_date: publication.publication_date }
        : {}),
      ...(publication.journal_number
        ? { journal_number: publication.journal_number }
        : {}),
      source_archive_filename: publication.source_archive_filename,
      archive_last_modified: publication.archive_last_modified,
      source_xml_path: publication.source_xml_path,
      normalized_json_path: path.relative(projectPath(), file),
      raw_xml_sha256: publication.raw_xml_sha256,
      references: publication.references.length,
      change_parts: publication.change_parts.length,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'data/normalized/lovtidend-avd1 JSON baseline',
    publications,
  };
}

function extractReferenceList(
  document: Document,
  className: string,
  referenceType: LovtidendReferenceType,
): NormalizedLovtidendReference[] {
  const container = document.querySelector(`dd.${className}`);

  if (!container) {
    return [];
  }

  const listItems = Array.from(container.querySelectorAll('li'))
    .map((item) => normalizeWhitespace(item.textContent ?? ''))
    .filter(Boolean);
  const refs = listItems.length > 0 ? listItems : extractRefsFromText(domText(container));

  return unique(refs).map((targetRef) => ({
    reference_type: referenceType,
    target_ref: targetRef,
    ...targetMetadata(targetRef),
  }));
}

function extractChangeParts(document: Document): NormalizedLovtidendChangePart[] {
  const elements = Array.from(
    document.querySelectorAll(
      CHANGE_ATTRIBUTE_OPERATIONS.map(({ attribute }) => `[${attribute}]`).join(', '),
    ),
  );
  const parts: NormalizedLovtidendChangePart[] = [];

  for (const element of elements) {
    const documentChangeRef =
      element.closest('[data-document]')?.getAttribute('data-document') ?? undefined;

    for (const { attribute, operation } of CHANGE_ATTRIBUTE_OPERATIONS) {
      const rawTarget = element.getAttribute(attribute);

      if (!rawTarget) {
        continue;
      }

      for (const targetRef of extractRefsFromText(rawTarget)) {
        parts.push({
          operation,
          target_ref: targetRef,
          ...targetMetadata(targetRef),
          ...(documentChangeRef ? { document_change_ref: documentChangeRef } : {}),
          text: domText(element),
          element_id: element.getAttribute('id') ?? undefined,
          xml_path: htmlPathSelector(element),
        });
      }
    }
  }

  return parts;
}

function targetMetadata(
  targetRef: string,
): Pick<NormalizedLovtidendReference, 'target_document_id' | 'target_kind'> {
  const targetKind = documentKindFromRef(targetRef);
  const targetDocumentId = documentIdFromRef(targetRef);

  return {
    ...(targetDocumentId ? { target_document_id: targetDocumentId } : {}),
    ...(targetKind !== 'unknown' ? { target_kind: targetKind } : {}),
  };
}

function documentIdFromRef(ref: string): string | undefined {
  const match = /^(lov|forskrift)\/(\d{4}-\d{2}-\d{2}(?:-\d+)?)/u.exec(ref);

  if (!match) {
    return undefined;
  }

  return `${match[1] === 'lov' ? 'LOV' : 'FOR'}-${match[2]}`;
}

function documentKindFromRef(
  ref?: string,
  dokid?: string,
): LovtidendDocumentKind {
  const value = `${ref ?? ''} ${dokid ?? ''}`;

  if (/\blov\//u.test(value)) {
    return 'lov';
  }

  if (/\bforskrift\//u.test(value)) {
    return 'forskrift';
  }

  return 'unknown';
}

function normalizePublicationId(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const refMatch = /^(lov|forskrift)\/(.+)$/u.exec(value);
  if (refMatch) {
    return `${refMatch[1] === 'lov' ? 'LOV' : 'FOR'}-${refMatch[2].replaceAll('/', '-')}`;
  }

  const normalized = value.trim().toUpperCase();
  return normalized ? normalized : undefined;
}

function idFromFilePath(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }

  return path.basename(filePath, path.extname(filePath)).toUpperCase();
}

function refidFromDokid(dokid?: string): string | undefined {
  const match = /^LTI\/(.+)$/u.exec(dokid ?? '');
  return match?.[1];
}

function sourceUrlFor(dokid: string | undefined, refid: string): string {
  if (dokid) {
    return `https://lovdata.no/dokument/${dokid}`;
  }

  return `https://lovdata.no/dokument/LTI/${refid}`;
}

function normalizePublicationDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}):(\d{2}))?$/u.exec(value);

  if (!match) {
    return value;
  }

  if (!match[2] || !match[3]) {
    return match[1];
  }

  return `${match[1]}T${match[2]}:${match[3]}:00`;
}

function extractRefsFromText(value: string): string[] {
  return unique(
    value
      .split(/\s*;;\s*|\s+/u)
      .flatMap((part) =>
        part.match(/\b(?:lov|forskrift)\/\d{4}-\d{2}-\d{2}-\d+(?:\/[^\s,;]+)*/gu) ??
        [],
      )
      .map((ref) => ref.replace(/[,.]$/u, ''))
      .filter(Boolean),
  );
}

function textFromDataList(document: Document, className: string): string | undefined {
  return textFromSelector(document, `dd.${className}`);
}

function textListFromDataList(
  document: Document,
  className: string,
): string | undefined {
  const container = document.querySelector(`dd.${className}`);

  if (!container) {
    return undefined;
  }

  const items = Array.from(container.querySelectorAll('li'))
    .map((item) => normalizeWhitespace(item.textContent ?? ''))
    .filter(Boolean);

  return items.length > 0 ? items.join('; ') : domText(container);
}

function textFromSelector(parent: Document | Element, selector: string): string | undefined {
  const text = parent.querySelector(selector)?.textContent;
  return text ? normalizeWhitespace(text) : undefined;
}

function htmlPathSelector(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.tagName.toLowerCase() !== 'html') {
    const id = current.getAttribute('id');
    if (id) {
      parts.unshift(`${current.tagName.toLowerCase()}#${id}`);
      break;
    }

    const parent = current.parentElement;
    const sameTagIndex = parent
      ? Array.from(parent.children)
          .filter((child) => child.tagName === current?.tagName)
          .indexOf(current) + 1
      : 1;
    parts.unshift(`${current.tagName.toLowerCase()}[${sameTagIndex}]`);
    current = parent;
  }

  return parts.join(' > ');
}

function domText(element: Element): string {
  return normalizeWhitespace(element.textContent ?? '');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isMainModule(): boolean {
  return process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
