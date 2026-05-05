# 08a - Norsk Lovtidend Provenance

## Goal

Add Lovdata `publicData` Norsk Lovtidend avd. I ingestion for `2001-2026`
before the standalone repository cutover.

The result should be searchable official publication and change provenance for
current laws and central regulations, without attempting full historical
consolidated law reconstruction.

## Scope

In scope:

- Discover all `lovtidend-avd1-*.tar.bz2` archives from
  `https://api.lovdata.no/v1/publicData/list`.
- Sync and extract Lovtidend avd. I archives.
- Normalize Lovtidend publication metadata and change references separately
  from current-law/current-regulation documents.
- Store source archive metadata and raw XML SHA-256 hashes.
- Add SQLite tables for Lovtidend publications, references, and change parts.
- Add full-text search over Lovtidend title, metadata, and publication text.
- Add MCP tools for Lovtidend search and document-change provenance.
- Update corpus metadata, source listings, smoke checks, and docs.

Out of scope:

- Full historical consolidated version reconstruction.
- Lovdata Pro material.
- Case law.
- Preparatory works.
- Local regulations.
- EU/EEA reference graph.
- Editorial commentary or annotations.

## Implementation Steps

1. Extend publicData archive discovery:

   - Keep the current MVP archive handling for:
     - `gjeldende-lover.tar.bz2`
     - `gjeldende-sentrale-forskrifter.tar.bz2`
   - Add discovery for every archive whose filename matches:

     ```text
     lovtidend-avd1-*.tar.bz2
     ```

   - Do not hard-code Lovtidend year ranges. Use the live list endpoint.
   - Current expected archives are:
     - `lovtidend-avd1-2001-2025.tar.bz2`
     - `lovtidend-avd1-2026.tar.bz2`

2. Update `scripts/publicdata-sync.ts`:

   - Sync current consolidated archives plus discovered Lovtidend avd. I
     archives.
   - Preserve `filename`, `sizeBytes`, `lastModified`, `downloadedAt`, local
     archive path, and extracted path in `data/raw/publicData/manifest.json`.
   - Extract Lovtidend archives under:

     ```text
     data/extracted/publicData/lovtidend-avd1/<archive-stem>/
     ```

3. Add `scripts/lovtidend-normalize.ts`:

   - Read extracted Lovtidend XML/HTML documents.
   - Write normalized JSON under:

     ```text
     data/normalized/lovtidend-avd1/
     ```

   - Capture publication fields:
     - stable publication id.
     - RefID.
     - DokID.
     - title.
     - short title.
     - department.
     - publication date.
     - journal number.
     - source archive filename.
     - source URL.
     - raw XML SHA-256.
     - full text.
   - Capture references from:
     - `changesToDocuments`.
     - `basedOn`.
   - Capture change parts from attributes such as:
     - `data-change-part`.
     - `data-repeal-part`.
     - `data-add-new-part`.
     - `data-move-part`.
   - For each change part, store:
     - operation.
     - target ref.
     - readable text.
     - DOM/XML path or element id when available.

4. Add `scripts/lovtidend-diff.ts`:

   - Compare the current normalized Lovtidend manifest against the previous
     Lovtidend normalized manifest.
   - Report added, changed, and removed publications.
   - Do not edit files.

5. Update `scripts/build-db.ts`:

   - Keep existing current-law/current-regulation tables backward compatible.
   - Add tables for:
     - `lovtidend_publications`.
     - `lovtidend_references`.
     - `lovtidend_change_parts`.
   - Add indexes for:
     - publication date.
     - RefID.
     - affected target ref.
     - operation.
   - Add FTS for Lovtidend title, metadata, and publication text.
   - Store Lovtidend counts and freshness in `db_metadata` or queryable tables.

6. Add MCP tools:

   - `search_lovtidend`
     - Inputs: `query`, optional `document_id`, optional `refid`, optional
       `year`, optional `date_from`, optional `date_to`, optional `operation`,
       optional `limit`.
     - Returns matching publications with snippets, publication date, journal
       number, affected refs, source URL, and metadata.

   - `get_lovtidend_publication`
     - Inputs: `publication_id` or `refid`.
     - Returns full publication metadata, affected documents, legal bases,
       parsed change parts, and optional full text.

   - `get_document_change_publications`
     - Inputs: `document_id`, optional `provision_ref`, optional `limit`.
     - Returns Lovtidend publications that affect the document or provision-like
       target ref.

7. Update source and corpus metadata:

   - Update `about` to report Lovtidend coverage, counts, and freshness
     separately from current consolidated law/regulation counts.
   - Update `list_sources` to include Lovtidend avd. I archives as provenance
     data.
   - Update `README.md` and `DATA_SOURCES.md` with the new workflow and scope
     limitations.

8. Add package scripts:

   ```json
   {
     "lovtidend:normalize": "node --import tsx scripts/lovtidend-normalize.ts",
     "lovtidend:diff": "node --import tsx scripts/lovtidend-diff.ts"
   }
   ```

9. Update validation:

   - Add Lovtidend smoke checks to `npm run validate`.
   - Keep existing stdio, HTTP, corpus, and unit tests passing.

## Refresh Workflow

Run:

```bash
npm run check-updates
npm run publicdata:sync
npm run publicdata:normalize
npm run lovtidend:normalize
npm run publicdata:diff
npm run lovtidend:diff
npm run build:db
npm run validate
```

## Verification

Automated:

```bash
npm run check-updates
npm run publicdata:sync
npm run publicdata:normalize
npm run lovtidend:normalize
npm run publicdata:diff
npm run lovtidend:diff
npm run build:db
npm run validate
```

Database smoke check:

```bash
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database('data/database.db', { readonly: true }); console.log(db.prepare('select count(*) as publications from lovtidend_publications').get()); console.log(db.prepare('select operation, count(*) as changes from lovtidend_change_parts group by operation order by operation').all()); db.close();"
```

Manual checks:

- Search Lovtidend for one known term.
- Retrieve one law Lovtidend publication.
- Retrieve one regulation Lovtidend publication.
- Lookup change publications for one known affected document.
- Confirm `about` reports Lovtidend freshness and counts.

## Test Plan

- Fixture test with one law Lovtidend XML and one regulation Lovtidend XML from
  `lovtidend-avd1-2026.tar.bz2`.
- Parser tests for:
  - title, RefID, DokID, publication date, and journal number.
  - `changesToDocuments`.
  - `basedOn`.
  - change operations: change, repeal, add, and move.
- DB build test confirming Lovtidend tables populate while current-law tables
  remain populated.
- Tool tests for:
  - `search_lovtidend`.
  - `get_lovtidend_publication`.
  - `get_document_change_publications`.
- Smoke test requiring:
  - nonzero Lovtidend publication count.
  - search result for a known Lovtidend term.
  - change lookup for a known affected document.
  - `about` reports Lovtidend freshness.

## Done Criteria

- Lovtidend avd. I archives are discovered from the live publicData list.
- Lovtidend archives can be synced and extracted.
- Lovtidend XML/HTML documents are normalized separately from current-law data.
- SQLite contains searchable Lovtidend publication, reference, and change-part
  tables.
- The three new MCP tools are listed and callable over stdio and HTTP.
- `about` and `list_sources` report Lovtidend provenance coverage.
- Validation passes after a full refresh.
- Existing current-law and current-regulation tools remain backward compatible.
