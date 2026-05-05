#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { XMLParser } from 'fast-xml-parser';
import { JSDOM } from 'jsdom';

import type {
  NormalizedDocument,
  NormalizedDocumentType,
  NormalizedSection,
  SourceDataset,
} from '../src/types/normalized.js';
import {
  datasetFromArchiveFilename,
  manifestPath,
  normalizedManifestPath,
  previousNormalizedManifestPath,
  pathExists,
  projectPath,
  readManifest,
  writeJson,
  type PublicDataManifestEntry,
} from './lib/publicdata.js';

type XmlValue = string | number | boolean | null | XmlObject | XmlValue[];
type XmlObject = Record<string, XmlValue>;

export interface NormalizeContext {
  sourceDataset: SourceDataset;
  archiveFilename: string;
  archiveLastModified: string;
  xmlFilePath?: string;
}

interface CliOptions {
  inputDir: string;
  outputDir: string;
  dataset?: SourceDataset;
  limit?: number;
}

interface NormalizedManifestDocument {
  document_id: string;
  source_dataset: SourceDataset;
  document_type: NormalizedDocumentType;
  title: string;
  short_title?: string;
  archive_filename: string;
  archive_size_bytes?: number;
  archive_last_modified: string;
  source_xml_path?: string;
  normalized_json_path: string;
  raw_xml_sha256: string;
  sections: number;
}

export interface NormalizedManifest {
  generatedAt: string;
  source: string;
  documents: Record<string, NormalizedManifestDocument>;
}

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

const SOURCE_DATASETS = new Set<SourceDataset>([
  'gjeldende-lover',
  'gjeldende-sentrale-forskrifter',
]);

const HEADING_KEYS = new Set([
  'heading',
  'overskrift',
  'title',
  'tittel',
  'sectionTitle',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

const PARAGRAPH_KEYS = new Set([
  'p',
  'legalP',
  'defaultP',
  'numberedLegalP',
  'paragraph',
  'ledd',
  'punktum',
  'li',
]);

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readManifest();
  const previousNormalizedManifest =
    (await readNormalizedManifest(normalizedManifestPath())) ??
    (await readNormalizedManifestFromDocuments(options.outputDir));
  const datasets = options.dataset
    ? [options.dataset]
    : await discoverDatasets(options.inputDir);

  let normalizedCount = 0;
  const manifestDocuments: Record<string, NormalizedManifestDocument> = {};

  for (const dataset of datasets) {
    const datasetInputDir = path.join(options.inputDir, dataset);
    const files = await collectXmlFiles(datasetInputDir);
    const archive = archiveForDataset(dataset, manifest?.files);
    const outputDir = path.join(options.outputDir, dataset);

    if (options.limit === undefined) {
      await rm(outputDir, { recursive: true, force: true });
    }

    await mkdir(outputDir, { recursive: true });

    for (const file of files.slice(0, options.limit ?? files.length)) {
      const xml = await readFile(file, 'utf8');
      const normalized = normalizeXmlDocument(xml, {
        sourceDataset: dataset,
        archiveFilename: archive?.archiveFilename ?? `${dataset}.tar.bz2`,
        archiveLastModified:
          archive?.archiveLastModified ?? (await stat(file)).mtime.toISOString(),
        xmlFilePath: file,
      });

      const outputPath = path.join(outputDir, `${slugify(normalized.id)}.json`);
      await writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
      manifestDocuments[manifestKey(normalized.source_dataset, normalized.id)] = {
        document_id: normalized.id,
        source_dataset: normalized.source_dataset,
        document_type: normalized.document_type,
        title: normalized.title,
        ...(normalized.short_title ? { short_title: normalized.short_title } : {}),
        archive_filename: normalized.archive_filename,
        ...(archive?.archiveSizeBytes !== undefined
          ? { archive_size_bytes: archive.archiveSizeBytes }
          : {}),
        archive_last_modified: normalized.archive_last_modified,
        source_xml_path: path.relative(projectPath(), file),
        normalized_json_path: path.relative(projectPath(), outputPath),
        raw_xml_sha256: normalized.raw_xml_sha256,
        sections: normalized.sections.length,
      };
      normalizedCount += 1;
    }
  }

  if (previousNormalizedManifest) {
    await writeJson(previousNormalizedManifestPath(), previousNormalizedManifest);
  }

  await writeJson(normalizedManifestPath(), {
    generatedAt: new Date().toISOString(),
    source: manifest?.source ?? manifestPath(),
    documents: manifestDocuments,
  } satisfies NormalizedManifest);

  console.log(`Normalized ${normalizedCount} publicData XML document(s).`);
  console.log(`Wrote ${normalizedManifestPath()}`);
}

export function normalizeXmlDocument(
  xml: string,
  context: NormalizeContext,
): NormalizedDocument {
  if (isLovdataHtml(xml)) {
    return normalizeHtmlDocument(xml, context);
  }

  const parsed = XML_PARSER.parse(xml) as XmlValue;
  const sourceDataset = context.sourceDataset;
  const documentType: NormalizedDocumentType =
    sourceDataset === 'gjeldende-lover' ? 'lov' : 'forskrift';

  const datokode = findFirstText(parsed, ['datokode', 'datoKode']);
  const documentId = findFirstText(parsed, ['dokumentID', 'documentID', 'documentId']);
  const lovdataRefid =
    normalizeRefid(findFirstText(parsed, ['refid', 'lovdata_refid', 'lovdataRefid'])) ??
    refidFromDocumentId(documentId);
  const id = deriveDocumentId({ datokode, documentId, lovdataRefid, documentType });
  const sections = makeProvisionRefsUnique(extractSections(parsed));

  if (sections.length === 0) {
    throw new Error(`${context.xmlFilePath ?? id}: no provisions found in XML`);
  }

  return {
    id,
    source_dataset: sourceDataset,
    archive_filename: context.archiveFilename,
    archive_last_modified: context.archiveLastModified,
    document_type: documentType,
    title: findDocumentTitle(parsed) ?? id,
    short_title: findFirstText(parsed, ['titleShort', 'shortTitle', 'short_title']),
    department: findFirstText(parsed, ['departement', 'department']),
    legal_area: findFirstText(parsed, ['legalArea', 'legal_area']),
    date_in_force: normalizeDate(findFirstText(parsed, ['dateInForce', 'date_in_force'])),
    last_change_in_force: normalizeDate(
      findFirstText(parsed, ['lastChangeInForce', 'last_change_in_force']),
    ),
    last_changed_by: findFirstText(parsed, ['lastChangedBy', 'last_changed_by']),
    lovdata_refid: lovdataRefid,
    source_url: sourceUrlFor({ documentId, lovdataRefid, id, documentType }),
    raw_xml_sha256: createHash('sha256').update(xml).digest('hex'),
    sections,
  };
}

function normalizeHtmlDocument(
  html: string,
  context: NormalizeContext,
): NormalizedDocument {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const sourceDataset = context.sourceDataset;
  const documentType: NormalizedDocumentType =
    sourceDataset === 'gjeldende-lover' ? 'lov' : 'forskrift';
  const main = document.querySelector('main.documentBody');
  const documentId =
    textFromSelector(document, 'dd.dokid') ??
    getAttribute(main, 'data-lovdata-url') ??
    getAttribute(main, 'data-lovdata-URL');
  const lovdataRefid =
    normalizeRefid(textFromSelector(document, 'dd.refid')) ??
    refidFromDocumentId(documentId);
  const id = withLanguageVariant(
    deriveDocumentId({
      datokode: textFromSelector(document, 'dd.legacyID'),
      documentId,
      lovdataRefid,
      documentType,
      fallbackId: idFromFilePath(context.xmlFilePath, documentType),
    }),
    context.xmlFilePath,
  );
  const sections = makeProvisionRefsUnique(extractHtmlSections(document));

  if (sections.length === 0) {
    throw new Error(`${context.xmlFilePath ?? id}: no provisions found in HTML`);
  }

  return {
    id,
    source_dataset: sourceDataset,
    archive_filename: context.archiveFilename,
    archive_last_modified: context.archiveLastModified,
    document_type: documentType,
    title:
      textFromSelector(document, 'dd.title') ??
      textFromSelector(document, 'main.documentBody > h1') ??
      textFromSelector(document, 'head > title') ??
      id,
    short_title: textFromSelector(document, 'dd.titleShort'),
    department: textFromSelector(document, 'dd.ministry'),
    legal_area: textFromSelector(document, 'dd.legalArea'),
    date_in_force: normalizeDate(textFromSelector(document, 'dd.dateInForce')),
    last_change_in_force: normalizeDate(
      textFromSelector(document, 'dd.lastChangeInForce'),
    ),
    last_changed_by: textFromSelector(document, 'dd.lastChangedBy'),
    lovdata_refid: lovdataRefid,
    source_url: sourceUrlFor({ documentId, lovdataRefid, id, documentType }),
    raw_xml_sha256: createHash('sha256').update(html).digest('hex'),
    sections,
  };
}

function isLovdataHtml(value: string): boolean {
  return /<html[\s>]/iu.test(value);
}

function extractHtmlSections(document: Document): NormalizedSection[] {
  const articles = Array.from(
    document.querySelectorAll('main.documentBody article.legalArticle'),
  );
  const articleSections = articles
    .map((article) => htmlArticleToSection(article))
    .filter((section): section is NormalizedSection => section !== undefined);

  if (articleSections.length > 0) {
    return articleSections;
  }

  const documentSection = htmlDocumentLevelSection(document);
  return documentSection ? [documentSection] : [];
}

function makeProvisionRefsUnique(sections: NormalizedSection[]): NormalizedSection[] {
  const refCounts = new Map<string, number>();

  for (const section of sections) {
    refCounts.set(section.provision_ref, (refCounts.get(section.provision_ref) ?? 0) + 1);
  }

  return sections.map((section) => {
    if ((refCounts.get(section.provision_ref) ?? 0) < 2) {
      return section;
    }

    return {
      ...section,
      provision_ref: `${section.provision_ref}#${section.section_id}`,
    };
  });
}

function htmlDocumentLevelSection(document: Document): NormalizedSection | undefined {
  const main = document.querySelector('main.documentBody');

  if (!main) {
    return undefined;
  }

  const directParagraphs = Array.from(main.children).filter(
    (child) => child.matches('article.legalP, p.legalP, div.legalP'),
  );
  const text =
    directParagraphs.length > 0
      ? directParagraphs.map((child) => domText(child)).join('\n')
      : domText(main);

  if (!text) {
    return undefined;
  }

  return {
    section_id: getAttribute(main, 'id') ?? 'document',
    provision_ref: 'document',
    heading: textFromSelector(document, 'main.documentBody > h1'),
    path: [],
    text,
    xml_path: htmlPathSelector(main),
  };
}

function htmlArticleToSection(article: Element): NormalizedSection | undefined {
  const dataName = getAttribute(article, 'data-name');
  const provisionRef = extractProvisionRef([
    dataName,
    textFromSelector(article, '.legalArticleValue'),
    getAttribute(article, 'data-lovdata-url'),
    getAttribute(article, 'data-lovdata-URL'),
    textFromSelector(article, '.legalArticleHeader'),
  ]) ?? dataName ?? extractProvisionRef([getAttribute(article, 'id')]);

  if (!provisionRef) {
    return undefined;
  }

  const heading =
    textFromSelector(article, '.legalArticleTitle') ??
    stripProvisionPrefix(textFromSelector(article, '.legalArticleHeader') ?? '');
  const text = extractHtmlProvisionText(article);

  if (!text) {
    return undefined;
  }

  return {
    section_id: getAttribute(article, 'id') ?? provisionRef,
    provision_ref: provisionRef,
    heading: heading || undefined,
    path: htmlPathForArticle(article),
    text,
    xml_path: htmlPathSelector(article),
  };
}

function extractHtmlProvisionText(article: Element): string {
  const directLegalParagraphs = Array.from(article.children).filter(
    (child) => child.matches('article.legalP, p.legalP, div.legalP'),
  );

  if (directLegalParagraphs.length > 0) {
    return directLegalParagraphs.map((child) => domText(child)).join('\n');
  }

  const clone = article.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      '.legalArticleHeader, .changesToParent, .historyNote, .footnote, .sourceNote',
    )
    .forEach((node) => node.remove());
  return domText(clone);
}

function htmlPathForArticle(article: Element): string[] {
  const headings: string[] = [];
  let current = article.parentElement;

  while (current && !current.matches('main.documentBody')) {
    if (current.matches('section')) {
      const heading = directHeadingText(current);
      if (heading) {
        headings.push(heading);
      }
    }
    current = current.parentElement;
  }

  return headings.reverse();
}

function directHeadingText(element: Element): string | undefined {
  for (const child of Array.from(element.children)) {
    if (/^H[1-6]$/u.test(child.tagName)) {
      return domText(child);
    }
  }

  return undefined;
}

function htmlPathSelector(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.tagName.toLowerCase() !== 'html') {
    const id = getAttribute(current, 'id');
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

function textFromSelector(parent: Document | Element, selector: string): string | undefined {
  const text = parent.querySelector(selector)?.textContent;
  return text ? normalizeWhitespace(text) : undefined;
}

function getAttribute(element: Element | null, name: string): string | undefined {
  const value = element?.getAttribute(name);
  return value && value.trim() ? value.trim() : undefined;
}

function domText(element: Element): string {
  return normalizeWhitespace(element.textContent ?? '');
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputDir: projectPath('data', 'extracted', 'publicData'),
    outputDir: projectPath('data', 'normalized'),
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

    if (arg.startsWith('--dataset=')) {
      const dataset = arg.slice('--dataset='.length);
      if (!SOURCE_DATASETS.has(dataset as SourceDataset)) {
        throw new Error(`Unsupported dataset: ${dataset}`);
      }
      options.dataset = dataset as SourceDataset;
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

async function discoverDatasets(inputDir: string): Promise<SourceDataset[]> {
  const entries = await readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && SOURCE_DATASETS.has(entry.name as SourceDataset))
    .map((entry) => entry.name as SourceDataset)
    .sort();
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

function archiveForDataset(
  dataset: SourceDataset,
  manifestFiles?: Record<string, PublicDataManifestEntry>,
): {
  archiveFilename: string;
  archiveLastModified: string;
  archiveSizeBytes?: number;
} | undefined {
  if (!manifestFiles) {
    return undefined;
  }

  for (const [filename, entry] of Object.entries(manifestFiles)) {
    if (entry.dataset === dataset || datasetFromArchiveFilename(filename) === dataset) {
      return {
        archiveFilename: filename,
        archiveLastModified: entry.lastModified ?? entry.downloadedAt,
        archiveSizeBytes: entry.sizeBytes,
      };
    }
  }

  return undefined;
}

async function readNormalizedManifest(
  filePath: string,
): Promise<NormalizedManifest | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  return JSON.parse(await readFile(filePath, 'utf8')) as NormalizedManifest;
}

async function readNormalizedManifestFromDocuments(
  outputDir: string,
): Promise<NormalizedManifest | undefined> {
  const files = await collectJsonFiles(outputDir);

  if (files.length === 0) {
    return undefined;
  }

  const documents: Record<string, NormalizedManifestDocument> = {};

  for (const file of files) {
    const document = JSON.parse(await readFile(file, 'utf8')) as NormalizedDocument;
    documents[manifestKey(document.source_dataset, document.id)] = {
      document_id: document.id,
      source_dataset: document.source_dataset,
      document_type: document.document_type,
      title: document.title,
      ...(document.short_title ? { short_title: document.short_title } : {}),
      archive_filename: document.archive_filename,
      archive_last_modified: document.archive_last_modified,
      normalized_json_path: path.relative(projectPath(), file),
      raw_xml_sha256: document.raw_xml_sha256,
      sections: document.sections.length,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'data/normalized JSON baseline',
    documents,
  };
}

function manifestKey(dataset: SourceDataset, documentId: string): string {
  return `${dataset}:${documentId}`;
}

function extractSections(parsed: XmlValue): NormalizedSection[] {
  const sections: NormalizedSection[] = [];
  walkElements(parsed, 'document', '$', [], sections);

  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = section.provision_ref;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function walkElements(
  value: XmlValue,
  tag: string,
  xmlPath: string,
  pathParts: string[],
  sections: NormalizedSection[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkElements(item, tag, `${xmlPath}[${index + 1}]`, pathParts, sections);
    });
    return;
  }

  if (!isXmlObject(value)) {
    return;
  }

  const candidate = buildSectionCandidate(tag, value, xmlPath, pathParts);
  if (candidate) {
    sections.push(candidate);
    return;
  }

  const heading = extractHeading(value);
  const nextPathParts =
    isPathElement(tag) && heading && !startsWithProvisionRef(heading)
      ? [...pathParts, stripProvisionPrefix(heading)]
      : pathParts;

  for (const [childTag, childValue] of Object.entries(value)) {
    if (isInternalKey(childTag)) {
      continue;
    }

    if (Array.isArray(childValue)) {
      childValue.forEach((item, index) => {
        walkElements(
          item,
          childTag,
          `${xmlPath}/${childTag}[${index + 1}]`,
          nextPathParts,
          sections,
        );
      });
      continue;
    }

    walkElements(childValue, childTag, `${xmlPath}/${childTag}`, nextPathParts, sections);
  }
}

function buildSectionCandidate(
  tag: string,
  node: XmlObject,
  xmlPath: string,
  pathParts: string[],
): NormalizedSection | undefined {
  const heading = extractHeading(node);
  const text = extractProvisionText(node, heading);
  const explicitSectionId = attributeText(node, 'id') ?? attributeText(node, 'data-id');
  const className = attributeText(node, 'class') ?? '';
  const isArticleLike =
    tag.toLowerCase() === 'article' || /legal|paragraf|provision/i.test(className);
  const provisionRef =
    extractProvisionRef([heading, explicitSectionId]) ??
    (isArticleLike ? extractProvisionRef([text]) : undefined);
  const sectionId = explicitSectionId ?? provisionRef;

  const looksLikeProvision =
    startsWithProvisionRef(heading ?? '') ||
    /paragraf|paragraph|provision/i.test(sectionId ?? '') ||
    isArticleLike;

  if (!looksLikeProvision || !provisionRef || text.length === 0) {
    return undefined;
  }

  return {
    section_id: sectionId ?? provisionRef,
    provision_ref: provisionRef,
    heading: heading ? stripProvisionPrefix(heading) : undefined,
    path: pathParts,
    text,
    xml_path: xmlPath,
  };
}

function extractProvisionText(node: XmlObject, heading?: string): string {
  const paragraphTexts = collectDirectParagraphTexts(node);
  const text = normalizeWhitespace(
    paragraphTexts.length > 0 ? paragraphTexts.join('\n') : textContent(node),
  );

  if (!heading) {
    return stripProvisionPrefix(text);
  }

  return stripProvisionPrefix(text.replace(heading, '').trim());
}

function collectDirectParagraphTexts(node: XmlObject): string[] {
  const texts: string[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (!PARAGRAPH_KEYS.has(key)) {
      continue;
    }

    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const text = normalizeWhitespace(textContent(item));
      if (text) {
        texts.push(text);
      }
    }
  }

  return texts;
}

function extractHeading(node: XmlObject): string | undefined {
  for (const [key, value] of Object.entries(node)) {
    if (!HEADING_KEYS.has(key)) {
      continue;
    }

    const text = normalizeWhitespace(textContent(value));
    if (text) {
      return text;
    }
  }

  return undefined;
}

function findDocumentTitle(parsed: XmlValue): string | undefined {
  return (
    findFirstText(parsed, ['documentTitle', 'dokumentTittel', 'lovtittel']) ??
    findFirstText(parsed, ['title'])
  );
}

function findFirstText(value: XmlValue, keys: string[]): string | undefined {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));

  function visit(candidate: XmlValue): string | undefined {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const found = visit(item);
        if (found) {
          return found;
        }
      }
      return undefined;
    }

    if (!isXmlObject(candidate)) {
      return undefined;
    }

    for (const [key, childValue] of Object.entries(candidate)) {
      if (keySet.has(key.toLowerCase())) {
        const text = normalizeWhitespace(textContent(childValue));
        if (text) {
          return text;
        }
      }
    }

    for (const [key, childValue] of Object.entries(candidate)) {
      if (isInternalKey(key)) {
        continue;
      }

      const found = visit(childValue);
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  return visit(value);
}

function deriveDocumentId(input: {
  datokode?: string;
  documentId?: string;
  lovdataRefid?: string;
  documentType: NormalizedDocumentType;
  fallbackId?: string;
}): string {
  const fromDatokode = input.datokode?.match(/\b(?:LOV|FOR)-\d{4}-\d{2}-\d{2}(?:-\d+)?\b/i);
  if (fromDatokode) {
    return fromDatokode[0].toUpperCase();
  }

  const source = input.lovdataRefid ?? refidFromDocumentId(input.documentId);
  const datePart = source?.match(/(?:lov|forskrift)\/(\d{4}-\d{2}-\d{2}(?:-\d+)?)/i)?.[1];

  if (datePart) {
    return `${input.documentType === 'lov' ? 'LOV' : 'FOR'}-${datePart}`.toUpperCase();
  }

  if (input.fallbackId) {
    return input.fallbackId;
  }

  throw new Error('Could not derive a stable document ID from XML metadata');
}

function idFromFilePath(
  filePath: string | undefined,
  documentType: NormalizedDocumentType,
): string | undefined {
  const filename = filePath ? path.basename(filePath) : undefined;
  const match = filename?.match(/(?:nl|sf)-(\d{4})(\d{2})(\d{2})(?:-(\d+))?(?:-[a-z]{2})?\.xml$/iu);

  if (!match) {
    return undefined;
  }

  const [, year, month, day, suffix] = match;
  return `${documentType === 'lov' ? 'LOV' : 'FOR'}-${year}-${month}-${day}${
    suffix ? `-${suffix}` : ''
  }`.toUpperCase();
}

function withLanguageVariant(id: string, filePath: string | undefined): string {
  const filename = filePath ? path.basename(filePath) : '';
  return /-nn\.xml$/iu.test(filename) ? `${id}-NN` : id;
}

function sourceUrlFor(input: {
  documentId?: string;
  lovdataRefid?: string;
  id: string;
  documentType: NormalizedDocumentType;
}): string {
  if (input.documentId?.match(/^(NL|SF)\//i)) {
    return `https://lovdata.no/dokument/${input.documentId}`;
  }

  if (input.lovdataRefid?.startsWith('lov/')) {
    return `https://lovdata.no/dokument/NL/${input.lovdataRefid}`;
  }

  if (input.lovdataRefid?.startsWith('forskrift/')) {
    return `https://lovdata.no/dokument/SF/${input.lovdataRefid}`;
  }

  return input.documentType === 'lov'
    ? `https://lovdata.no/dokument/NL/lov/${input.id.replace(/^LOV-/u, '').toLowerCase()}`
    : `https://lovdata.no/dokument/SF/forskrift/${input.id.replace(/^FOR-/u, '').toLowerCase()}`;
}

function refidFromDocumentId(documentId?: string): string | undefined {
  const match = documentId?.match(/^(?:NL|SF)\/(.+)$/i);
  return normalizeRefid(match?.[1]);
}

function normalizeRefid(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(/^\/+/u, '').trim() || undefined;
}

function extractProvisionRef(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (!value) {
      continue;
    }

    const match = value.match(
      /§+\s*([0-9]+(?:\s*[a-zA-ZÆØÅæøå])?(?:[-:][0-9]+(?:\s*[a-zA-ZÆØÅæøå])?)?)/u,
    );
    if (match) {
      return `§ ${match[1].replace(/\s+/gu, ' ').toLowerCase()}`;
    }

    const idMatch = value.match(/PARAGRAF[_-]?([0-9]+(?:[-_][0-9]+)?[a-zA-ZÆØÅæøå]?)/iu);
    if (idMatch) {
      return `§ ${idMatch[1].replace('_', '-').toLowerCase()}`;
    }
  }

  return undefined;
}

function stripProvisionPrefix(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/^§+\s*[0-9]+(?:[-:][0-9]+)?[a-zA-ZÆØÅæøå]?\s*\.?\s*/u, '')
      .trim(),
  );
}

function startsWithProvisionRef(text: string): boolean {
  return /^§+\s*[0-9]/u.test(text.trim());
}

function isPathElement(tag: string): boolean {
  return ['part', 'chapter', 'section', 'division', 'kapittel', 'del'].includes(
    tag.toLowerCase(),
  );
}

function textContent(value: XmlValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => textContent(item)).filter(Boolean).join(' ');
  }

  return Object.entries(value)
    .filter(([key]) => !key.startsWith('@_'))
    .map(([, childValue]) => textContent(childValue))
    .filter(Boolean)
    .join(' ');
}

function attributeText(node: XmlObject, name: string): string | undefined {
  const value = node[`@_${name}`] ?? node[`@_data-${name}`];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/[ \t\f\v]+/gu, ' ').replace(/\s*\n\s*/gu, '\n').trim();
}

function normalizeDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const iso = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/u);
  if (iso) {
    return iso[0];
  }

  const norwegian = value.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/u);
  if (norwegian) {
    return `${norwegian[3]}-${norwegian[2]}-${norwegian[1]}`;
  }

  return value;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

function isInternalKey(key: string): boolean {
  return key.startsWith('@_') || key === '#text';
}

function isXmlObject(value: XmlValue): value is XmlObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    console.error(`Manifest path: ${manifestPath()}`);
    process.exitCode = 1;
  });
}
