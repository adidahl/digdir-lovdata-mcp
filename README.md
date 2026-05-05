# Digdir Norwegian Law MCP

Standalone workspace for the Digdir Norwegian Law MCP server.

Current status:

- Node and TypeScript package scaffold is present.
- Lovdata publicData ingestion scripts are present for current laws and central
  regulations, with Norsk Lovtidend avd. I provenance ingestion started.
- Normalized JSON can be built into `data/database.db`.
- A stdio MCP runtime is present with the MVP core tools:
  `about`, `list_sources`, `search_legislation`, `find_by_title`,
  `get_document`, `get_provision`, `check_currency`, `validate_citation`, and
  `format_citation`, plus Lovtidend provenance tools:
  `search_lovtidend`, `get_lovtidend_publication`, and
  `get_document_change_publications`.
- Streamable HTTP hosting is available at `/mcp`, with `GET /health` for
  hosting checks.
- Docker hosting is available with a bundled read-only `data/database.db`.

Fresh setup:

```bash
npm ci
npm run build:db
npm run validate
```

Planned local commands:

- `npm run build`
- `npm test`
- `npm run validate`
- `npm run build:db`
- `npm run check-updates`
- `npm run dev:http`
- `npm run start:http`
- `npm run publicdata:list`
- `npm run publicdata:sync`
- `npm run publicdata:normalize`
- `npm run publicdata:diff`
- `npm run lovtidend:normalize`
- `npm run lovtidend:diff`
- `npm run smoke:corpus`
- `npm run smoke:stdio`
- `npm run smoke:http`

Manual data refresh:

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

`check-updates` only reports live archive metadata differences. `publicdata:diff`
only reports extracted current-law XML changes against the previous normalized
manifest. `lovtidend:diff` reports added, changed, and removed Lovtidend
publication records against `data/normalized/lovtidend-avd1/manifest.previous.json`.

HTTP hosting:

```bash
npm run build
npm run build:db
PORT=3000 npm run start:http
```

Then check:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/mcp
```

Docker hosting:

```bash
npm run build:db
docker build -t digdir-norwegian-law-mcp .
docker run --rm -p 3000:3000 digdir-norwegian-law-mcp
```

In another terminal:

```bash
curl http://localhost:3000/health
```

The original migration plan files remain in [docs/plan](docs/plan/README.md) for
project history and future milestone tracking.
