# Digdir Norwegian Law MCP

Digdir Norwegian Law MCP is a read-only Model Context Protocol server for
searching and citing current Norwegian laws and central regulations from
Lovdata `publicData`. It indexes the corpus into a bundled SQLite database and
exposes legal lookup tools over stdio for desktop MCP clients, plus a
streamable HTTP endpoint for hosted deployments.

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

## Install in MCP clients

The stdio server starts from the built JavaScript entry point. Build the project
and database first:

```bash
cd /absolute/path/to/digdir-lovdata-mcp
npm ci
npm run build:db
npm run build
```

Use an absolute path in MCP client configuration. Replace
`/absolute/path/to/digdir-lovdata-mcp` with your checkout path.

### VS Code

Create or edit `.vscode/mcp.json` in the workspace where you want Copilot Agent
mode to use the server:

```json
{
  "servers": {
    "digdir-norwegian-law": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/digdir-lovdata-mcp/dist/index.js"
      ]
    }
  }
}
```

Then run `MCP: List Servers` from the Command Palette and start
`digdir-norwegian-law`.

### Codex

Add the server with the Codex CLI:

```bash
codex mcp add digdir-norwegian-law -- node /absolute/path/to/digdir-lovdata-mcp/dist/index.js
codex mcp list
```

Or add it manually to `~/.codex/config.toml`:

```toml
[mcp_servers.digdir-norwegian-law]
command = "node"
args = ["/absolute/path/to/digdir-lovdata-mcp/dist/index.js"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

Inside Codex, use `/mcp` to confirm the server is active.

### Claude Desktop

Open the Claude Desktop configuration file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server:

```json
{
  "mcpServers": {
    "digdir-norwegian-law": {
      "command": "node",
      "args": [
        "/absolute/path/to/digdir-lovdata-mcp/dist/index.js"
      ]
    }
  }
}
```

Restart Claude Desktop after saving the file.

### Claude Code

For Claude Code, add it as a local stdio server:

```bash
claude mcp add digdir-norwegian-law -- node /absolute/path/to/digdir-lovdata-mcp/dist/index.js
claude mcp list
```

For a team-shared Claude Code project config, add a `.mcp.json` file at the
project root:

```json
{
  "mcpServers": {
    "digdir-norwegian-law": {
      "command": "node",
      "args": [
        "/absolute/path/to/digdir-lovdata-mcp/dist/index.js"
      ]
    }
  }
}
```

### Optional database path

By default the server opens `data/database.db` in this repository. To point a
client at a different SQLite file, add this environment variable to the MCP
server config:

```json
{
  "DIGDIR_NORWEGIAN_LAW_DB_PATH": "/absolute/path/to/database.db"
}
```

For JSON clients, place it under the server's `env` field. For Codex TOML, add:

```toml
[mcp_servers.digdir-norwegian-law.env]
DIGDIR_NORWEGIAN_LAW_DB_PATH = "/absolute/path/to/database.db"
```

## Tools

The server exposes read-only tools for:

- `about`: server metadata, corpus counts, freshness, and disclaimer.
- `list_sources`: Lovdata publicData source and coverage notes.
- `search_legislation`: full-text search over current laws and central
  regulations.
- `find_by_title`: resolve law and regulation titles to stable Lovdata IDs.
- `get_document`: retrieve a current law or central regulation.
- `get_provision`: retrieve a specific current provision.
- `check_currency`: check whether a document or provision exists in the current
  corpus.
- `validate_citation`: validate supported Norwegian legal citations.
- `format_citation`: format Lovdata IDs and provisions as citations.
- `search_lovtidend`, `get_lovtidend_publication`, and
  `get_document_change_publications`: query Norsk Lovtidend avd. I provenance.

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

Vercel MCP test deployment:

See [docs/vercel-deploy.md](docs/vercel-deploy.md). The Vercel setup uses a
smaller current-law SQLite database uploaded to Vercel Blob because the full
Lovtidend-enabled database is too large for Vercel Hobby function limits.

The original migration plan files remain in [docs/plan](docs/plan/README.md) for
project history and future milestone tracking.
