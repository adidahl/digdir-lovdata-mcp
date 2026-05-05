# 01 - Contained Project Setup

## Goal

Create a self-contained Node/TypeScript project inside
`digdir-norwegian-law-mcp/` without creating a nested Git repository.

The result should be a movable future repo folder with its own package metadata,
dependencies, TypeScript config, test config, local docs, and ignore rules.

## Scope

In scope:

- Initialize `package.json`.
- Install dependencies locally in this folder.
- Add TypeScript and Vitest configuration.
- Add project-level `README.md`, `LEGAL_DATA_LICENSE.md`, and
  `DATA_SOURCES.md` placeholders.
- Add `.gitignore` for future standalone use.
- Create empty source, script, data, and test directories.

Out of scope:

- MCP runtime code.
- SQLite schema or database generation.
- Lovdata ingestion.
- Docker or HTTP hosting.
- `git init`.

## Implementation Steps

1. From the reference repo root, enter the contained workspace:

   ```bash
   cd digdir-norwegian-law-mcp
   ```

2. Initialize the package:

   ```bash
   npm init -y
   npm install @modelcontextprotocol/sdk better-sqlite3 fast-xml-parser
   npm install -D typescript tsx vitest @types/node @types/better-sqlite3
   ```

   If a package scaffold already exists from an earlier experiment, reconcile
   it with this plan instead of starting over:

   - remove `jsdom` and `@types/jsdom` unless a future XML parser genuinely
     needs them;
   - add `fast-xml-parser`;
   - replace `ingest` and `ingest:relevant` scripts with the `publicdata:*`
     scripts below;
   - keep `package-lock.json` after dependency updates.

3. Update `package.json`:

   - `name`: `@your-scope/digdir-norwegian-law-mcp`
   - `version`: `0.1.0`
   - `description`: `Digdir Norwegian Law MCP server`
   - `type`: `module`
   - `main`: `dist/index.js`
   - `bin.digdir-norwegian-law-mcp`: `dist/index.js`
   - `files`: `["dist", "data/database.db"]`
   - scripts:
     - `build`: `tsc`
     - `dev`: `node --import tsx src/index.ts`
     - `start`: `node dist/index.js`
     - `build:db`: `node --import tsx scripts/build-db.ts`
     - `publicdata:list`: `node --import tsx scripts/publicdata-list.ts`
     - `publicdata:sync`: `node --import tsx scripts/publicdata-sync.ts`
     - `publicdata:normalize`: `node --import tsx scripts/publicdata-normalize.ts`
     - `test`: `vitest run`
     - `validate`: `npm run build && npm test`

4. Add `tsconfig.json` configured for:

   - `target`: `ES2022`
   - `module`: `ESNext`
   - `moduleResolution`: `bundler`
   - `rootDir`: `src`
   - `outDir`: `dist`
   - `strict`: `true`
   - `declaration`: `true`
   - include only `src/**/*`

5. Add `vitest.config.ts` with Node environment and test includes:

   - `tests/**/*.test.ts`
   - `__tests__/**/*.test.ts`, only if that directory is later used.

6. Create directories:

   ```text
   src/
   scripts/
   data/raw/
   data/extracted/
   data/normalized/
   data/seed/
   tests/
   ```

7. Add `.gitignore` for the future standalone repo:

   ```text
   node_modules/
   dist/
   coverage/
   data/database.db
   data/raw/
   data/extracted/
   data/normalized/
   *.log
   .env
   ```

8. Do not add `.git/` inside this folder.

## Verification

Run from `digdir-norwegian-law-mcp/`:

```bash
test -f package.json
test -f package-lock.json
test -d node_modules
test -d src
test -d scripts
test -d data/raw
test -d data/extracted
test -d data/normalized
test -d data/seed
test -d tests
npm pkg get name type main scripts.build scripts.test
npm pkg get scripts.publicdata:list scripts.publicdata:sync scripts.publicdata:normalize
npm ls fast-xml-parser
test ! -d .git
```

Manual check:

- Confirm `node_modules/` is inside `digdir-norwegian-law-mcp/`.
- Confirm no files were created at the reference repo root except this folder.

## Done Criteria

- The contained project has local package metadata and dependencies.
- No nested Git repository exists.
- No MCP implementation has been added yet.
- The folder can be copied later as the basis of a standalone repo.
