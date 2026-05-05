# Data Sources

The MVP text corpus is scoped to current consolidated Norwegian laws and current
consolidated central regulations from Lovdata `publicData` XML archives.
Norsk Lovtidend avd. I is indexed separately as official publication and change
provenance, not as the source of consolidated current text.

Primary MVP archives:

- `gjeldende-lover.tar.bz2`
- `gjeldende-sentrale-forskrifter.tar.bz2`

Provenance archives:

- `lovtidend-avd1-*.tar.bz2`

`gjeldende-lover.tar.bz2` is the current-law source. Current central
regulations come from `gjeldende-sentrale-forskrifter.tar.bz2`.

The ingestion flow must discover available files through
`https://api.lovdata.no/v1/publicData/list` and download selected files through
`https://api.lovdata.no/v1/publicData/get/{filename}`.

Update checks compare live `sizeBytes` and `lastModified` values from the list
endpoint with `data/raw/publicData/manifest.json`. Normalization stores
SHA-256 hashes for extracted XML in each normalized document and in
`data/normalized/manifest.json`; the previous manifest is retained as
`data/normalized/manifest.previous.json` so `npm run publicdata:diff` can report
added, changed, and removed XML documents between refreshes.

Lovtidend normalization writes publication records to
`data/normalized/lovtidend-avd1/` and keeps its own manifest at
`data/normalized/lovtidend-avd1/manifest.json`. `npm run lovtidend:diff`
compares against `manifest.previous.json` in that directory.

Still out of scope:

- Historical consolidated versions are outside MVP scope.
- EU and EEA law tables are outside MVP scope.
- Case-law full text is outside MVP scope.
- Preparatory works are outside MVP scope.
- Lovdata Pro-only material is outside MVP scope.

`data/relevant-statutes.json` is optional support material only. It can be used
to choose priority smoke-test documents or examples, but it is not the primary
ingestion mechanism.
