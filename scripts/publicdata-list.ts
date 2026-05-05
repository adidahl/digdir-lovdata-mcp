#!/usr/bin/env tsx

import {
  fetchPublicDataListRaw,
  normalizePublicDataListPayload,
  projectPath,
  writeJson,
} from './lib/publicdata.js';

async function main(): Promise<void> {
  const payload = await fetchPublicDataListRaw();
  const archives = normalizePublicDataListPayload(payload);

  await writeJson(projectPath('data', 'raw', 'publicData-list.json'), payload);

  for (const archive of archives) {
    console.log(
      [
        archive.filename,
        archive.description ?? '',
        archive.sizeBytes ?? '',
        archive.lastModified ?? '',
      ].join('\t'),
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
