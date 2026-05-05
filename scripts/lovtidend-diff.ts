#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { NormalizedLovtidendPublication } from '../src/types/normalized.js';
import {
  lovtidendManifestPath,
  lovtidendNormalizedDir,
  pathExists,
  previousLovtidendManifestPath,
  projectPath,
} from './lib/publicdata.js';
import type { LovtidendManifest } from './lovtidend-normalize.js';

interface DiffEntry {
  publication_id: string;
  refid: string;
  title?: string;
  publication_date?: string;
  source_archive_filename?: string;
  source_xml_path?: string;
  normalized_json_path?: string;
  raw_xml_sha256: string;
}

interface Baseline {
  label: string;
  entries: Map<string, DiffEntry>;
}

async function main(): Promise<void> {
  const [baseline, currentEntries] = await Promise.all([
    readBaseline(),
    readCurrentEntries(),
  ]);

  const added = [...currentEntries.values()].filter(
    (entry) => !baseline.entries.has(entry.publication_id),
  );
  const removed = [...baseline.entries.values()].filter(
    (entry) => !currentEntries.has(entry.publication_id),
  );
  const changed = [...currentEntries.values()].filter((entry) => {
    const previous = baseline.entries.get(entry.publication_id);
    return previous !== undefined && previous.raw_xml_sha256 !== entry.raw_xml_sha256;
  });
  const unchanged = currentEntries.size - added.length - changed.length;

  console.log(`Baseline: ${baseline.label}`);
  console.log(`Current Lovtidend publications: ${currentEntries.size}`);
  console.log(`Added: ${added.length}`);
  console.log(`Changed: ${changed.length}`);
  console.log(`Removed: ${removed.length}`);
  console.log(`Unchanged: ${unchanged}`);

  printEntries('ADDED', added);
  printEntries('CHANGED', changed);
  printEntries('REMOVED', removed);
}

async function readBaseline(): Promise<Baseline> {
  const previousManifest = previousLovtidendManifestPath();
  if (await pathExists(previousManifest)) {
    return {
      label: path.relative(projectPath(), previousManifest),
      entries: manifestEntries(await readManifest(previousManifest)),
    };
  }

  const currentManifest = lovtidendManifestPath();
  if (await pathExists(currentManifest)) {
    return {
      label: `${path.relative(projectPath(), currentManifest)} (no previous manifest found)`,
      entries: manifestEntries(await readManifest(currentManifest)),
    };
  }

  return {
    label: 'data/normalized/lovtidend-avd1 JSON publications (no manifest found)',
    entries: await normalizedJsonEntries(lovtidendNormalizedDir()),
  };
}

async function readCurrentEntries(): Promise<Map<string, DiffEntry>> {
  if (await pathExists(lovtidendManifestPath())) {
    return manifestEntries(await readManifest(lovtidendManifestPath()));
  }

  return normalizedJsonEntries(lovtidendNormalizedDir());
}

async function readManifest(filePath: string): Promise<LovtidendManifest> {
  return JSON.parse(await readFile(filePath, 'utf8')) as LovtidendManifest;
}

function manifestEntries(manifest: LovtidendManifest): Map<string, DiffEntry> {
  return new Map(
    Object.values(manifest.publications).map((entry) => [
      entry.publication_id,
      {
        publication_id: entry.publication_id,
        refid: entry.refid,
        title: entry.title,
        publication_date: entry.publication_date,
        source_archive_filename: entry.source_archive_filename,
        source_xml_path: entry.source_xml_path,
        normalized_json_path: entry.normalized_json_path,
        raw_xml_sha256: entry.raw_xml_sha256,
      },
    ]),
  );
}

async function normalizedJsonEntries(dir: string): Promise<Map<string, DiffEntry>> {
  if (!(await pathExists(dir))) {
    return new Map();
  }

  const files = await collectJsonFiles(dir);
  const entries = new Map<string, DiffEntry>();

  for (const file of files) {
    const publication = JSON.parse(
      await readFile(file, 'utf8'),
    ) as NormalizedLovtidendPublication;
    entries.set(publication.publication_id, {
      publication_id: publication.publication_id,
      refid: publication.refid,
      title: publication.title,
      publication_date: publication.publication_date,
      source_archive_filename: publication.source_archive_filename,
      source_xml_path: publication.source_xml_path,
      normalized_json_path: path.relative(projectPath(), file),
      raw_xml_sha256: publication.raw_xml_sha256,
    });
  }

  return entries;
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
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

function printEntries(label: string, entries: DiffEntry[]): void {
  if (entries.length === 0) {
    return;
  }

  console.log(`${label}:`);
  for (const entry of entries.slice(0, 20)) {
    console.log(
      [
        entry.publication_id,
        entry.refid,
        entry.raw_xml_sha256,
        entry.publication_date ?? '',
        entry.source_archive_filename ?? '',
        entry.source_xml_path ?? entry.normalized_json_path ?? '',
        entry.title ?? '',
      ].join('\t'),
    );
  }

  if (entries.length > 20) {
    console.log(`... ${entries.length - 20} more`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
