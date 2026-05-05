# 04 - Stdio MCP Runtime

## Goal

Create the minimal MCP SDK stdio server for Digdir Norwegian Law MCP.

The result should be a local MCP process that can start, open the SQLite
database read-only, advertise basic tools, and shut down cleanly.

## Scope

In scope:

- Add `src/index.ts`.
- Add minimal tool registry.
- Add `about` and `list_sources` tools.
- Open `data/database.db` read-only with `better-sqlite3`.
- Support `DIGDIR_NORWEGIAN_LAW_DB_PATH`.
- Add a stdio smoke script or smoke test.

Out of scope:

- Search and provision retrieval tools.
- HTTP transport.
- Docker.
- EU, case-law, or preparatory works capabilities.

## Implementation Steps

1. Add `src/index.ts` using:

   - `Server` from `@modelcontextprotocol/sdk/server/index.js`.
   - `StdioServerTransport`.
   - `better-sqlite3`.

2. Configure:

   - `SERVER_NAME`: `digdir-norwegian-law`.
   - DB env var: `DIGDIR_NORWEGIAN_LAW_DB_PATH`.
   - default DB path: `data/database.db`.

3. Add `src/tools/registry.ts` with:

   - `ListToolsRequestSchema`.
   - `CallToolRequestSchema`.
   - only `about` and `list_sources` at this milestone.

4. Add `src/tools/about.ts`:

   - return name, version, jurisdiction `NO`, counts, freshness, source
     warning, and legal disclaimer.

5. Add `src/tools/list-sources.ts`:

   - return Lovdata `publicData` as the MVP source.
   - include current laws and central regulations datasets.
   - include NLOD 2.0 license note, update policy, and verification
     requirement.

6. Add a smoke test script:

   - spawn `node dist/index.js`.
   - initialize an MCP client over stdio.
   - call `list_tools`.
   - assert `about` and `list_sources` are listed.

7. Add package script:

   - `smoke:stdio`: run the smoke script.

## Verification

Run from `digdir-norwegian-law-mcp/`:

```bash
npm run build
npm run build:db
npm run smoke:stdio
```

Manual:

- Add the local stdio command to an MCP client.
- Confirm the client lists `about` and `list_sources`.
- Call `about` and confirm it returns JSON text.

## Done Criteria

- The stdio MCP server starts without crashing.
- The database opens read-only.
- `about` and `list_sources` are advertised and callable.
- The smoke script passes.
- No core search tools are advertised yet.
