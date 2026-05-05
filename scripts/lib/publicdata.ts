import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import type {
  PublicDataDataset,
  SourceDataset,
} from '../../src/types/normalized.js';

export const PUBLICDATA_LIST_URL = 'https://api.lovdata.no/v1/publicData/list';
export const PUBLICDATA_GET_BASE_URL = 'https://api.lovdata.no/v1/publicData/get';

export const MVP_DATASETS = [
  'gjeldende-lover.tar.bz2',
  'gjeldende-sentrale-forskrifter.tar.bz2',
] as const;

export const LOVTIDEND_AVD1_DATASET = 'lovtidend-avd1' as const;
export const LOVTIDEND_AVD1_ARCHIVE_PATTERN = /^lovtidend-avd1-.+\.tar\.bz2$/u;

export const PUBLICDATA_ATTRIBUTION =
  'Contains data under the Norwegian Licence for Open Government Data (NLOD 2.0) ' +
  'made available by Stiftelsen Lovdata. The data has been processed, parsed, ' +
  'and indexed by Digdir Norwegian Law MCP.';

export interface PublicDataArchive {
  filename: string;
  description?: string;
  sizeBytes?: number;
  lastModified?: string;
  raw: unknown;
}

export interface PublicDataManifestEntry extends PublicDataArchive {
  dataset: PublicDataDataset;
  archivePath: string;
  extractedPath: string;
  downloadedAt: string;
  attribution: string;
}

export interface PublicDataManifest {
  generatedAt: string;
  source: string;
  files: Record<string, PublicDataManifestEntry>;
}

const execFileAsync = promisify(execFile);

export function projectPath(...parts: string[]): string {
  return path.resolve(process.cwd(), ...parts);
}

export function datasetFromArchiveFilename(filename: string): PublicDataDataset {
  if (filename === 'gjeldende-lover.tar.bz2') {
    return 'gjeldende-lover';
  }

  if (filename === 'gjeldende-sentrale-forskrifter.tar.bz2') {
    return 'gjeldende-sentrale-forskrifter';
  }

  if (isLovtidendAvd1ArchiveFilename(filename)) {
    return LOVTIDEND_AVD1_DATASET;
  }

  throw new Error(`Unsupported publicData archive: ${filename}`);
}

export function isCurrentPublicDataDataset(
  dataset: PublicDataDataset,
): dataset is SourceDataset {
  return dataset === 'gjeldende-lover' || dataset === 'gjeldende-sentrale-forskrifter';
}

export function isLovtidendAvd1ArchiveFilename(filename: string): boolean {
  return LOVTIDEND_AVD1_ARCHIVE_PATTERN.test(filename);
}

export function discoverLovtidendAvd1ArchiveFilenames(
  archives: PublicDataArchive[],
): string[] {
  return archives
    .map((archive) => archive.filename)
    .filter(isLovtidendAvd1ArchiveFilename)
    .sort((a, b) => a.localeCompare(b));
}

export function archiveStem(filename: string): string {
  return filename.replace(/\.tar\.bz2$/u, '');
}

export function archivePath(filename: string): string {
  return projectPath('data', 'raw', 'publicData', filename);
}

export function extractedDatasetPath(dataset: PublicDataDataset): string {
  return projectPath('data', 'extracted', 'publicData', dataset);
}

export function extractedArchivePath(filename: string): string {
  const dataset = datasetFromArchiveFilename(filename);

  if (dataset === LOVTIDEND_AVD1_DATASET) {
    return path.join(extractedDatasetPath(dataset), archiveStem(filename));
  }

  return extractedDatasetPath(dataset);
}

export function lovtidendNormalizedDir(): string {
  return projectPath('data', 'normalized', LOVTIDEND_AVD1_DATASET);
}

export function lovtidendManifestPath(): string {
  return path.join(lovtidendNormalizedDir(), 'manifest.json');
}

export function previousLovtidendManifestPath(): string {
  return path.join(lovtidendNormalizedDir(), 'manifest.previous.json');
}

export function manifestPath(): string {
  return projectPath('data', 'raw', 'publicData', 'manifest.json');
}

export function normalizedManifestPath(): string {
  return projectPath('data', 'normalized', 'manifest.json');
}

export function previousNormalizedManifestPath(): string {
  return projectPath('data', 'normalized', 'manifest.previous.json');
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function fetchPublicDataListRaw(): Promise<unknown> {
  return fetchJson(PUBLICDATA_LIST_URL);
}

export function normalizePublicDataListPayload(payload: unknown): PublicDataArchive[] {
  const items = extractArchiveItems(payload);

  return items
    .map((item) => normalizeArchiveItem(item))
    .filter((item): item is PublicDataArchive => item !== undefined)
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

export async function fetchPublicDataList(): Promise<PublicDataArchive[]> {
  return normalizePublicDataListPayload(await fetchPublicDataListRaw());
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(`${filePath}.tmp`, filePath);
}

export async function readManifest(): Promise<PublicDataManifest | undefined> {
  const filePath = manifestPath();

  if (!(await pathExists(filePath))) {
    return undefined;
  }

  return JSON.parse(await readFile(filePath, 'utf8')) as PublicDataManifest;
}

export function shouldDownloadArchive(
  archive: PublicDataArchive,
  previous?: PublicDataManifestEntry,
): boolean {
  if (!previous) {
    return true;
  }

  if (archive.sizeBytes !== undefined && archive.sizeBytes !== previous.sizeBytes) {
    return true;
  }

  if (archive.lastModified !== undefined && archive.lastModified !== previous.lastModified) {
    return true;
  }

  return false;
}

export async function downloadArchive(archive: PublicDataArchive): Promise<string> {
  const outputPath = archivePath(archive.filename);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const url = `${PUBLICDATA_GET_BASE_URL}/${encodeURIComponent(archive.filename)}`;
  const response = await fetchWithRetry(url);

  if (!response.body) {
    throw new Error(`Lovdata returned an empty response body for ${archive.filename}`);
  }

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(`${outputPath}.tmp`),
  );
  await rename(`${outputPath}.tmp`, outputPath);

  return outputPath;
}

export async function extractArchive(archive: PublicDataArchive): Promise<string> {
  const outputPath = extractedArchivePath(archive.filename);

  await rm(outputPath, { recursive: true, force: true });
  await mkdir(outputPath, { recursive: true });
  await execFileAsync('tar', ['-xjf', archivePath(archive.filename), '-C', outputPath]);

  return outputPath;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetchWithRetry(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Digdir-Norwegian-Law-MCP/0.1.0',
    },
  });

  return response.json();
}

async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(60_000),
      });

      if (response.ok) {
        return response;
      }

      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await sleep(1_000 * attempt);
    }
  }

  throw new Error(
    `Failed to fetch ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function extractArchiveItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (isRecord(payload)) {
    for (const key of ['files', 'data', 'items', 'archives']) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value;
      }
    }

    return Object.entries(payload).map(([filename, value]) => {
      if (isRecord(value)) {
        return { filename, ...value };
      }
      return { filename, value };
    });
  }

  throw new Error('Unexpected Lovdata publicData/list response shape');
}

function normalizeArchiveItem(item: unknown): PublicDataArchive | undefined {
  if (!isRecord(item)) {
    return undefined;
  }

  const filename = firstString(item, ['filename', 'fileName', 'name', 'file']);
  if (!filename) {
    return undefined;
  }

  return {
    filename,
    description: firstString(item, ['description', 'title', 'label']),
    sizeBytes: firstNumber(item, ['sizeBytes', 'size', 'contentLength', 'bytes']),
    lastModified: firstString(item, ['lastModified', 'last_modified', 'modified', 'updated']),
    raw: item,
  };
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }

    if (typeof value === 'number') {
      return String(value);
    }
  }

  return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
