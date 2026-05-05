# Digdir Norwegian Law MCP Plan Pack

This plan pack is the implementation playbook for building the contained Digdir
Norwegian Law MCP workspace into a standalone, hostable MCP server.

Follow the files in numeric order. Each milestone has a concrete goal, scoped
implementation work, verification commands or manual checks, and done criteria.
Do not start the next milestone until the current milestone has passed its
verification.

## Milestones

| Step | Plan | Goal |
| --- | --- | --- |
| 01 | [Contained Project Setup](01-contained-project-setup.md) | Create the local Node/TypeScript project inside this folder. |
| 02 | [SQLite Data Model](02-sqlite-data-model.md) | Build a read-only SQLite database for current laws and central regulations. |
| 03 | [Lovdata PublicData Ingestion](03-lovdata-ingestion.md) | Download Lovdata publicData XML archives and normalize them locally. |
| 04 | [Stdio MCP Runtime](04-stdio-mcp-runtime.md) | Start a minimal MCP SDK stdio server. |
| 05 | [Core Tools](05-core-tools.md) | Implement current-law search and deterministic retrieval tools. |
| 06 | [Test Suite](06-test-suite.md) | Add focused automated and manual smoke tests. |
| 07 | [HTTP Docker Hosting](07-http-docker-hosting.md) | Host the MCP over Streamable HTTP with bundled SQLite. |
| 08 | [Data Expansion and Updates](08-data-expansion-and-updates.md) | Add archive sync, hash-based updates, and dataset growth checks. |
| 08a | [Norsk Lovtidend Provenance](08a-norsk-lovtidend-provenance.md) | Add official publication and change provenance for laws and regulations. |
| 09 | [Standalone Repo Cutover](09-standalone-repo-cutover.md) | Move this workspace into its own repository. |

## Working Rules

- Keep the Digdir project self-contained inside `digdir-norwegian-law-mcp/`.
- Do not create a nested Git repository during the migration phase.
- Use `better-sqlite3` directly, not `@ansvar/mcp-sqlite`.
- Use SQLite as a bundled file database, not an external PostgreSQL service.
- Use Lovdata `publicData` XML archives as the primary source.
- Include current laws and central regulations in the MVP corpus.
- Keep EU, case-law, and preparatory works out of the MVP.
- Track raw XML SHA-256 hashes so changed documents can be detected between
  archive refreshes.
- Treat Norsk Lovtidend archives as later provenance data, not current-law text
  for the MVP.
- Prefer one implemented milestone per working session.
- Record any changed decisions in the relevant plan file before implementing.
