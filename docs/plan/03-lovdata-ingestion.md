# 03 - Lovdata PublicData Ingestion

## Goal

Add ingestion for Lovdata's open `publicData` XML archives.

The result should be a repeatable path from Lovdata archive discovery to
downloaded XML archives, extracted XML files, and normalized JSON documents that
can be consumed by `scripts/build-db.ts`.

## Scope

In scope:

- Add `scripts/publicdata-list.ts`.
- Add `scripts/publicdata-sync.ts`.
- Add `scripts/publicdata-normalize.ts`.
- Download current consolidated laws and central regulations.
- Extract `.tar.bz2` archives locally.
- Parse Lovdata XML into normalized document JSON.
- Record NLOD 2.0 attribution and source metadata.

Out of scope:

- Individual Lovdata HTML scraping.
- Historical consolidated versions.
- Norsk Lovtidend provenance indexing.
- EU reference extraction.
- Case-law or preparatory works ingestion.

## Implementation Steps

1. Add constants:

   ```ts
   const PUBLICDATA_LIST_URL = 'https://api.lovdata.no/v1/publicData/list';
   const PUBLICDATA_GET_BASE_URL = 'https://api.lovdata.no/v1/publicData/get';
   const MVP_DATASETS = [
     'gjeldende-lover.tar.bz2',
     'gjeldende-sentrale-forskrifter.tar.bz2',
   ];
   ```

2. Implement `scripts/publicdata-list.ts`:

   - fetch `PUBLICDATA_LIST_URL`.
   - write the response to `data/raw/publicData-list.json`.
   - print filename, description, size, and lastModified for each available
     file.
   - do not hard-code Lovtidend filenames.

3. Implement `scripts/publicdata-sync.ts`:

   - read the live list endpoint.
   - select the two MVP archives by filename.
   - download changed archives to `data/raw/publicData/`.
   - compare `sizeBytes` and `lastModified` against local metadata.
   - write `data/raw/publicData/manifest.json`.
   - extract each changed archive into `data/extracted/publicData/<dataset>/`.

4. Use system `tar` for extraction in the first implementation:

   ```bash
   tar -xjf data/raw/publicData/gjeldende-lover.tar.bz2 -C data/extracted/publicData/gjeldende-lover
   ```

   Docker hosting must install `tar` and `bzip2` packages.

5. Implement `scripts/publicdata-normalize.ts`:

   - walk extracted XML files.
   - parse XML with `fast-xml-parser`.
   - identify source dataset from the extraction folder.
   - compute `raw_xml_sha256`.
   - derive stable document ID from XML metadata, not filename.
   - derive `source_url` from `lovdata_refid` or known Lovdata ID.
   - extract document metadata:
     - title.
     - short title.
     - department.
     - legal area.
     - date in force.
     - last change in force.
     - last changed by.
     - Lovdata refid.
   - extract sections/provisions:
     - `section_id`, for example `§ 1`.
     - `provision_ref`, for example `1` or `3:5` when chapter context exists.
     - heading.
     - hierarchical path.
     - full text.
     - XML path, when practical.

6. Write normalized documents under:

   ```text
   data/normalized/gjeldende-lover/
   data/normalized/gjeldende-sentrale-forskrifter/
   ```

7. Add `LEGAL_DATA_LICENSE.md` and `DATA_SOURCES.md`:

   - cite NLOD 2.0.
   - name Stiftelsen Lovdata as source.
   - state that Digdir Norwegian Law MCP processes, parses, chunks, and indexes
     the data.
   - state that MVP covers current laws and central regulations only.

8. Add parser fixture tests using a small local XML fixture before relying on
   the full live archive.

## Verification

Automated:

```bash
npm run publicdata:list
npm run publicdata:sync
npm run publicdata:normalize
npm run build:db
```

Parser fixture:

```bash
npm test -- tests/publicdata-normalize.test.ts
```

Manual checks:

```bash
test -f data/raw/publicData-list.json
test -f data/raw/publicData/manifest.json
find data/extracted/publicData -name '*.xml' | head
find data/normalized -name '*.json' | head
```

Inspect one normalized document:

```bash
node -e "const fs=require('fs'); const p=fs.readdirSync('./data/normalized/gjeldende-lover').find(f=>f.endsWith('.json')); const d=JSON.parse(fs.readFileSync('./data/normalized/gjeldende-lover/'+p,'utf8')); console.log(d.id, d.document_type, d.title, d.sections?.length, d.raw_xml_sha256)"
```

## Done Criteria

- Lovdata `publicData/list` is fetched and stored.
- Current laws and central regulations archives can be downloaded.
- Archives can be extracted locally.
- XML files can be normalized to JSON.
- Normalized JSON builds successfully into SQLite.
- Source archive metadata and NLOD attribution are captured.
- No HTML scraping is required for the MVP ingestion path.
