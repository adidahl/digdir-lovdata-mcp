# 08 - Data Expansion and Updates

## Goal

Expand and refresh the current-law corpus using Lovdata `publicData` archive
metadata and per-document XML hashes.

The result should be a repeatable update workflow that discovers available
archives, downloads changed MVP archives, normalizes XML, rebuilds SQLite, and
verifies the corpus.

## Scope

In scope:

- `publicData/list` based archive discovery.
- Sync current laws and central regulations.
- Preserve archive `filename`, `sizeBytes`, and `lastModified`.
- Hash extracted XML documents with SHA-256.
- Rebuild the local read-only SQLite database.
- Add data count and search smoke checks.
- Document update limitations.

Out of scope:

- Public `recent_changes` MCP tool.
- Fully automated publishing.
- Norsk Lovtidend provenance indexing.
- EU/EEA references.
- Case-law and preparatory works.
- Paid Lovdata Pro data.

## Implementation Steps

1. Treat these archive names as the MVP target set:

   - `gjeldende-lover.tar.bz2`
   - `gjeldende-sentrale-forskrifter.tar.bz2`

2. Never hard-code Lovtidend year archive names. Always discover them from:

   ```text
   https://api.lovdata.no/v1/publicData/list
   ```

3. Add `scripts/check-updates.ts`:

   - fetch the live list endpoint.
   - compare live `sizeBytes` and `lastModified` to
     `data/raw/publicData/manifest.json`.
   - report which MVP archives are new or changed.
   - do not download or edit files.

4. Add `scripts/publicdata-diff.ts`:

   - compare current extracted XML hashes to the previous normalized manifest.
   - report added, changed, and removed XML documents.
   - do not edit files.

5. Add package scripts:

   - `check-updates`: `node --import tsx scripts/check-updates.ts`
   - `publicdata:diff`: `node --import tsx scripts/publicdata-diff.ts`

6. Define the manual update workflow:

   ```bash
   npm run check-updates
   npm run publicdata:sync
   npm run publicdata:normalize
   npm run publicdata:diff
   npm run build:db
   npm run validate
   ```

7. Add corpus smoke checks:

   - total documents by `type`.
   - total provisions by `type`.
   - search result for one law term.
   - search result for one regulation term.
   - title lookup for one known short title.

8. Update `DATA_SOURCES.md`:

   - current laws come from `gjeldende-lover.tar.bz2`.
   - current central regulations come from
     `gjeldende-sentrale-forskrifter.tar.bz2`.
   - Norsk Lovtidend archives are deferred provenance data.
   - historical consolidated versions, case law, preparatory works, and Lovdata
     Pro material are outside MVP scope.

9. Keep `data/relevant-statutes.json` optional only:

   - use it for smoke-test priority documents or docs examples.
   - do not use it as the primary ingestion mechanism.

## Verification

Run:

```bash
npm run check-updates
npm run publicdata:sync
npm run publicdata:normalize
npm run publicdata:diff
npm run build:db
npm run validate
```

Database count smoke check:

```bash
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database('data/database.db', { readonly: true }); console.log(db.prepare('select type, count(*) as docs from legal_documents group by type').all()); console.log(db.prepare('select count(*) as provisions from legal_provisions').get()); db.close();"
```

Manual:

- Search for one term expected in a current law.
- Search for one term expected in a central regulation.
- Retrieve one provision from each dataset.
- Confirm `about` reports archive freshness.

## Done Criteria

- Update checks are based on Lovdata publicData archive metadata.
- Changed archives can be downloaded and extracted.
- Extracted XML hashes are tracked.
- Normalized JSON can be regenerated from the archives.
- Rebuilt SQLite contains both laws and central regulations.
- Validation passes after refresh.
- Update checks can report without mutating files.
