# 02 - SQLite Data Model

## Goal

Create the first SQLite data model and build pipeline for current Norwegian
laws and central regulations from Lovdata `publicData` XML archives.

The result should be `data/database.db`, built from normalized JSON records,
with searchable current provision text and enough archive metadata for
attribution, freshness, and deterministic retrieval.

## Scope

In scope:

- Add normalized JSON types for Lovdata publicData documents and sections.
- Add `scripts/build-db.ts`.
- Create core SQLite tables and FTS5 indexes.
- Support current consolidated laws and central regulations.
- Preserve source archive metadata and raw XML hashes.
- Use `better-sqlite3` for database creation.

Out of scope:

- Live Lovdata HTML fetching.
- Historical consolidated versions or `as_of_date` lookups.
- Norsk Lovtidend provenance indexing.
- MCP runtime.
- EU/EEA, case-law, and preparatory works tables.

## Implementation Steps

1. Implement `scripts/build-db.ts` to rebuild `data/database.db` from
   `data/normalized/**/*.json`.

2. Use this normalized document shape as the build input:

   ```ts
   interface NormalizedDocument {
     id: string;
     source_dataset: 'gjeldende-lover' | 'gjeldende-sentrale-forskrifter';
     archive_filename: string;
     archive_last_modified: string;
     document_type: 'lov' | 'forskrift';
     title: string;
     short_title?: string;
     department?: string;
     legal_area?: string;
     date_in_force?: string;
     last_change_in_force?: string;
     last_changed_by?: string;
     lovdata_refid?: string;
     source_url: string;
     raw_xml_sha256: string;
     sections: NormalizedSection[];
   }

   interface NormalizedSection {
     section_id: string;
     provision_ref: string;
     heading?: string;
     path: string[];
     text: string;
     xml_path?: string;
   }
   ```

3. Create `legal_documents` with these MVP columns:

   - `id`
   - `source_dataset`
   - `archive_filename`
   - `archive_last_modified`
   - `type` with values `lov` or `forskrift`
   - `title`
   - `short_title`
   - `department`
   - `legal_area`
   - `date_in_force`
   - `last_change_in_force`
   - `last_changed_by`
   - `lovdata_refid`
   - `source_url`
   - `raw_xml_sha256`
   - `status`, default `in_force`
   - `last_updated`

4. Create `legal_provisions` with these MVP columns:

   - `id`
   - `document_id`
   - `provision_ref`
   - `section_id`
   - `heading`
   - `path` as JSON text
   - `content`
   - `xml_path`

5. Create indexes:

   - `idx_documents_type`
   - `idx_documents_source_dataset`
   - `idx_documents_department`
   - `idx_documents_legal_area`
   - `idx_provisions_doc`
   - unique `document_id, provision_ref`

6. Create `provisions_fts` over:

   - `content`
   - `heading`

   Add FTS triggers for insert, update, and delete.

7. Create `document_title_fts` over:

   - `title`
   - `short_title`

   Use it for `find_by_title`.

8. Create `db_metadata` with:

   - `schema_version`: `1`
   - `built_at`: current ISO timestamp.
   - `builder`: `build-db.ts`
   - `jurisdiction`: `NO`
   - `features`: JSON array containing `core_legislation` and
     `central_regulations`.

9. Add one deterministic normalized fixture under:

   ```text
   data/normalized/gjeldende-lover/lov-2018-06-15-38.sample.json
   ```

   It must include one document and at least two sections.

10. Do not create `legal_provision_versions` in the MVP. Lovdata publicData
    current consolidated datasets do not provide historical consolidated text.

## Verification

Run from `digdir-norwegian-law-mcp/`:

```bash
npm run build:db
test -f data/database.db
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database('data/database.db', { readonly: true }); console.log(db.prepare(\"select count(*) as docs from legal_documents\").get()); console.log(db.prepare(\"select count(*) as sections from legal_provisions\").get()); console.log(db.prepare(\"select count(*) as fts from provisions_fts\").get()); console.log(db.prepare(\"select count(*) as title_fts from document_title_fts\").get()); db.close();"
```

Manual check:

- Open `data/database.db` with a SQLite viewer if available.
- Confirm `legal_documents`, `legal_provisions`, `provisions_fts`,
  `document_title_fts`, and `db_metadata` exist.
- Confirm no historical version, EU, case-law, or preparatory works tables exist.

## Done Criteria

- `npm run build:db` creates a valid SQLite file.
- At least one law and two sections are inserted from normalized JSON.
- Provision FTS and title FTS rows exist.
- Source dataset, archive filename, archive timestamp, source URL, and raw XML
  hash are stored.
- The MVP database represents current consolidated text only.
