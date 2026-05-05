# Agent Context

This folder is the standalone workspace for the Digdir Norwegian Law MCP server.

Current state:

- Planning/instruction files remain useful project history, but this repository
  should now build and run on its own.
- Do not rely on files outside this repository.
- The generated SQLite database is local build output and is ignored by Git.

Important locations:

- Implementation plan pack: `docs/plan/README.md`
- Numbered milestone plans: `docs/plan/01-*.md` through `docs/plan/09-*.md`

Working rules:

- Follow the numbered plan files sequentially.
- Keep the project self-contained.
- Use `better-sqlite3`, not `@ansvar/mcp-sqlite`.
- Use bundled SQLite (`data/database.db`), not an external database, for the MVP.
- Use Lovdata `publicData` XML archives as the primary source.
- Include current laws and central regulations in the MVP corpus.
- Treat Norsk Lovtidend avd. I as provenance data; keep raw/extracted archive
  data out of Git unless a later repo policy explicitly changes that.
- Keep EU, case-law, and preparatory works out of the MVP unless a later plan
  explicitly adds them.
