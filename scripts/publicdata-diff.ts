#!/usr/bin/env tsx

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  NormalizedDocument,
  NormalizedDocumentType,
  SourceDataset,
} from '../src/types/normalized.js';
import {
  MVP_DATASETS,
  datasetFromArchiveFilename,
  extractedDatasetPath,
  normalizedManifestPath,
  pathExists,
  previousNormalizedManifestPath,
  projectPath,
  readManifest,
  type PublicDataManifestEntry,
} from './lib/publicdata.js';
import {
  normalizeXmlDocument,
  type NormalizedManifest,
} from './publicdata-normalize.js';

interface DiffEntry {
  key: string;
  document_id: string;
  source_dataset: SourceDataset;
  document_type?: NormalizedDocumentType;
  title?: string;
  raw_xml_sha256: string;
  source_xml_path?: string;
  normalized_json_path?: string;
}

interface Baseline {
  label: string;
  entries: Map<string, DiffEntry>;
}

interface ArchiveForDataset {
  archiveFilename: string;
  archiveLastModified?: string;
}

async function main(): Promise<void> {
  const [baseline, currentEntries] = await Promise.all([
    readBaseline(),
    readCurrentExtractedEntries(),
  ]);

  const added = [...currentEntries.values()].filter(
    (entry) => !baseline.entries.has(entry.key),
  );
  const removed = [...baseline.entries.values()].filter(
    (entry) => !currentEntries.has(entry.key),
  );
  const changed = [...currentEntries.values()].filter((entry) => {
    const previous = baseline.entries.get(entry.key);
    return previous !== undefined && previous.raw_xml_sha256 !== entry.raw_xml_sha256;
  });
  const unchanged = currentEntries.size - added.length - changed.length;

  console.log(`Baseline: ${baseline.label}`);
  console.log(`Current extracted XML documents: ${currentEntries.size}`);
  console.log(`Added: ${added.length}`);
  console.log(`Changed: ${changed.length}`);
  console.log(`Removed: ${removed.length}`);
  console.log(`Unchanged: ${unchanged}`);

  printEntries('ADDED', added);
  printEntries('CHANGED', changed);
  printEntries('REMOVED', removed);
}

async function readBaseline(): Promise<Baseline> {
  const previousManifest = previousNormalizedManifestPath();
  if (await pathExists(previousManifest)) {
    return {
      label: path.relative(projectPath(), previousManifest),
      entries: manifestEntries(await readNormalizedManifest(previousManifest)),
    };
  }

  const currentManifest = normalizedManifestPath();
  if (await pathExists(currentManifest)) {
    return {
      label: `${path.relative(projectPath(), currentManifest)} (no previous manifest found)`,
      entries: manifestEntries(await readNormalizedManifest(currentManifest)),
    };
  }

  return {
    label: 'data/normalized JSON documents (no normalized manifest found)',
    entries: await normalizedJsonEntries(projectPath('data', 'normalized')),
  };
}

async function readCurrentExtractedEntries(): Promise<Map<string, DiffEntry>> {
  const manifest = await readManifest();
  const entries = new Map<string, DiffEntry>();

  for (const archiveFilename of MVP_DATASETS) {
    const dataset = datasetFromArchiveFilename(archiveFilename);
    const datasetPath = extractedDatasetPath(dataset);

    if (!(await pathExists(datasetPath))) {
      throw new Error(`Missing extracted dataset: ${datasetPath}`);
    }

    const archive = archiveForDataset(dataset, manifest?.files) ?? {
      archiveFilename,
      archiveLastModified: undefined,
    };
    const files = await collectFiles(datasetPath, (file) =>
      file.toLowerCase().endsWith('.xml'),
    );

    for (const file of files) {
      const xml = await readFile(file, 'utf8');
      const normalized = normalizeXmlDocument(xml, {
        sourceDataset: dataset,
        archiveFilename: archive.archiveFilename,
        archiveLastModified:
          archive.archiveLastModified ?? (await stat(file)).mtime.toISOString(),
        xmlFilePath: file,
      });

      const key = manifestKey(normalized.source_dataset, normalized.id);
      entries.set(key, {
        key,
        document_id: normalized.id,
        source_dataset: normalized.source_dataset,
        document_type: normalized.document_type,
        title: normalized.title,
        raw_xml_sha256: normalized.raw_xml_sha256,
        source_xml_path: path.relative(projectPath(), file),
      });
    }
  }

  return entries;
}

function archiveForDataset(
  dataset: SourceDataset,
  manifestFiles?: Record<string, PublicDataManifestEntry>,
): ArchiveForDataset | undefined {
  if (!manifestFiles) {
    return undefined;
  }

  for (const [filename, entry] of Object.entries(manifestFiles)) {
    if (entry.dataset === dataset || datasetFromArchiveFilename(filename) === dataset) {
      return {
        archiveFilename: filename,
        archiveLastModified: entry.lastModified ?? entry.downloadedAt,
      };
    }
  }

  return undefined;
}

async function readNormalizedManifest(filePath: string): Promise<NormalizedManifest> {
  return JSON.parse(await readFile(filePath, 'utf8')) as NormalizedManifest;
}

function manifestEntries(manifest: NormalizedManifest): Map<string, DiffEntry> {
  return new Map(
    Object.entries(manifest.documents).map(([key, entry]) => [
      key,
      {
        key,
        document_id: entry.document_id,
        source_dataset: entry.source_dataset,
        document_type: entry.document_type,
        title: entry.title,
        raw_xml_sha256: entry.raw_xml_sha256,
        source_xml_path: entry.source_xml_path,
        normalized_json_path: entry.normalized_json_path,
      },
    ]),
  );
}

async function normalizedJsonEntries(dir: string): Promise<Map<string, DiffEntry>> {
  if (!(await pathExists(dir))) {
    return new Map();
  }

  const files = await collectFiles(dir, (file) => {
    const filename = path.basename(file);
    return (
      filename.endsWith('.json') &&
      filename !== 'manifest.json' &&
      filename !== 'manifest.previous.json'
    );
  });
  const entries = new Map<string, DiffEntry>();

  for (const file of files) {
    const document = JSON.parse(await readFile(file, 'utf8')) as NormalizedDocument;
    const key = manifestKey(document.source_dataset, document.id);
    entries.set(key, {
      key,
      document_id: document.id,
      source_dataset: document.source_dataset,
      document_type: document.document_type,
      title: document.title,
      raw_xml_sha256: document.raw_xml_sha256,
      normalized_json_path: path.relative(projectPath(), file),
    });
  }

  return entries;
}

async function collectFiles(
  dir: string,
  include: (filePath: string) => boolean,
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectFiles(entryPath, include);
      }

      if (entry.isFile() && include(entryPath)) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat().sort();
}

function printEntries(label: string, entries: DiffEntry[]): void {
  if (entries.length === 0) {
    return;
  }

  console.log(`${label}:`);
  for (const entry of entries.slice(0, 20)) {
    console.log(
      [
        entry.source_dataset,
        entry.document_id,
        entry.raw_xml_sha256,
        entry.source_xml_path ?? entry.normalized_json_path ?? '',
        entry.title ?? '',
      ].join('\t'),
    );
  }

  if (entries.length > 20) {
    console.log(`... ${entries.length - 20} more`);
  }
}

function manifestKey(dataset: SourceDataset, documentId: string): string {
  return `${dataset}:${documentId}`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
