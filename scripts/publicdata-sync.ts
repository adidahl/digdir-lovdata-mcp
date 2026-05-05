#!/usr/bin/env tsx

import {
  MVP_DATASETS,
  PUBLICDATA_ATTRIBUTION,
  PUBLICDATA_LIST_URL,
  archivePath,
  datasetFromArchiveFilename,
  discoverLovtidendAvd1ArchiveFilenames,
  downloadArchive,
  extractArchive,
  extractedArchivePath,
  fetchPublicDataList,
  manifestPath,
  pathExists,
  readManifest,
  shouldDownloadArchive,
  writeJson,
  type PublicDataManifest,
  type PublicDataManifestEntry,
} from './lib/publicdata.js';

async function main(): Promise<void> {
  const availableArchives = await fetchPublicDataList();
  const previousManifest = await readManifest();
  const nextFiles: Record<string, PublicDataManifestEntry> = {
    ...(previousManifest?.files ?? {}),
  };
  const targetArchives = [
    ...MVP_DATASETS,
    ...discoverLovtidendAvd1ArchiveFilenames(availableArchives),
  ];

  for (const filename of targetArchives) {
    const archive = availableArchives.find((candidate) => candidate.filename === filename);

    if (!archive) {
      throw new Error(`Lovdata publicData/list did not include ${filename}`);
    }

    const dataset = datasetFromArchiveFilename(filename);
    const extractedPath = extractedArchivePath(filename);
    const previousEntry = previousManifest?.files[filename];
    const localArchiveExists = await pathExists(archivePath(filename));
    const changed = shouldDownloadArchive(archive, previousEntry) || !localArchiveExists;

    if (changed) {
      console.log(`Downloading ${filename}`);
      await downloadArchive(archive);
    } else {
      console.log(`Archive unchanged: ${filename}`);
    }

    if (changed || !(await pathExists(extractedPath))) {
      console.log(`Extracting ${filename}`);
      await extractArchive(archive);
    }

    nextFiles[filename] = {
      ...archive,
      dataset,
      archivePath: archivePath(filename),
      extractedPath,
      downloadedAt: changed
        ? new Date().toISOString()
        : previousEntry?.downloadedAt ?? new Date().toISOString(),
      attribution: PUBLICDATA_ATTRIBUTION,
    };
  }

  const manifest: PublicDataManifest = {
    generatedAt: new Date().toISOString(),
    source: PUBLICDATA_LIST_URL,
    files: nextFiles,
  };

  await writeJson(manifestPath(), manifest);
  console.log(`Wrote ${manifestPath()}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
