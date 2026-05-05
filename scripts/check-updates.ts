#!/usr/bin/env tsx

import {
  MVP_DATASETS,
  datasetFromArchiveFilename,
  discoverLovtidendAvd1ArchiveFilenames,
  fetchPublicDataList,
  readManifest,
  type PublicDataArchive,
  type PublicDataManifestEntry,
} from './lib/publicdata.js';

interface ArchiveUpdateStatus {
  filename: string;
  dataset: string;
  status: 'new' | 'changed' | 'unchanged';
  reasons: string[];
  live: {
    sizeBytes?: number;
    lastModified?: string;
  };
  local?: {
    sizeBytes?: number;
    lastModified?: string;
    downloadedAt: string;
  };
}

async function main(): Promise<void> {
  const [liveArchives, localManifest] = await Promise.all([
    fetchPublicDataList(),
    readManifest(),
  ]);
  const targetArchives = [
    ...MVP_DATASETS,
    ...discoverLovtidendAvd1ArchiveFilenames(liveArchives),
  ];
  const statuses = targetArchives.map((filename) => {
    const live = liveArchives.find((archive) => archive.filename === filename);

    if (!live) {
      throw new Error(`Lovdata publicData/list did not include ${filename}`);
    }

    return compareArchive(live, localManifest?.files[filename]);
  });

  const changed = statuses.filter((status) => status.status !== 'unchanged');

  console.log(`Checked ${statuses.length} publicData archive(s).`);
  console.log(`New or changed archives: ${changed.length}`);

  for (const status of statuses) {
    const reason = status.reasons.length > 0 ? status.reasons.join('; ') : 'metadata matches';
    console.log(
      [
        status.status.toUpperCase(),
        status.filename,
        status.dataset,
        `size=${status.live.sizeBytes ?? 'unknown'}`,
        `lastModified=${status.live.lastModified ?? 'unknown'}`,
        reason,
      ].join('\t'),
    );
  }
}

function compareArchive(
  live: PublicDataArchive,
  local?: PublicDataManifestEntry,
): ArchiveUpdateStatus {
  const reasons: string[] = [];

  if (!local) {
    reasons.push('not present in local manifest');
  } else {
    if (live.sizeBytes !== undefined && live.sizeBytes !== local.sizeBytes) {
      reasons.push(`sizeBytes ${local.sizeBytes ?? 'unknown'} -> ${live.sizeBytes}`);
    }

    if (live.lastModified !== undefined && live.lastModified !== local.lastModified) {
      reasons.push(
        `lastModified ${local.lastModified ?? 'unknown'} -> ${live.lastModified}`,
      );
    }
  }

  return {
    filename: live.filename,
    dataset: datasetFromArchiveFilename(live.filename),
    status: !local ? 'new' : reasons.length > 0 ? 'changed' : 'unchanged',
    reasons,
    live: {
      sizeBytes: live.sizeBytes,
      lastModified: live.lastModified,
    },
    ...(local
      ? {
          local: {
            sizeBytes: local.sizeBytes,
            lastModified: local.lastModified,
            downloadedAt: local.downloadedAt,
          },
        }
      : {}),
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
