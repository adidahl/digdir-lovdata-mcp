# 06 - Test Suite

## Goal

Create a focused test suite that protects the MVP behavior before hosting or
data expansion.

The result should be a repeatable verification command that covers schema,
ingestion, citation logic, tools, and stdio MCP smoke behavior.

## Scope

In scope:

- Vitest unit tests.
- Tool tests against an in-memory or temporary SQLite test DB.
- Citation parser, formatter, and validator tests.
- PublicData XML parser fixture tests.
- Stdio MCP smoke test.
- Manual acceptance checklist.

Out of scope:

- Browser tests.
- Performance testing.
- Contract/golden tests.
- HTTP and Docker tests, which are covered in step 07.

## Implementation Steps

1. Add `tests/fixtures/test-db.ts`:

   - create an isolated test database.
   - execute the MVP schema.
   - insert one current law and one current regulation.
   - insert chaptered and flat provisions.
   - cover missing document and missing provision failure paths.

2. Add tool tests:

   - `tests/tools/search-legislation.test.ts`
   - `tests/tools/find-by-title.test.ts`
   - `tests/tools/get-document.test.ts`
   - `tests/tools/get-provision.test.ts`
   - `tests/tools/check-currency.test.ts`
   - `tests/tools/validate-citation.test.ts`
   - `tests/tools/format-citation.test.ts`
   - `tests/tools/about.test.ts`
   - `tests/tools/list-sources.test.ts`

3. Add citation tests:

   - parse valid Lovdata IDs.
   - reject unsupported citation formats.
   - format full, short, and pinpoint forms.
   - validate missing documents and missing provisions.

4. Add ingestion tests:

   - parse a local Lovdata publicData XML fixture.
   - confirm document ID, title, source URL, raw XML hash, and section count.
   - confirm current laws and central regulations normalize to the same JSON
     shape.

5. Add smoke tests:

   - `smoke:stdio` for MCP `list_tools`.
   - optional `smoke:tools` for calling `about` and one search tool.

6. Update `npm run validate` to run:

   - TypeScript build.
   - Vitest tests.
   - stdio smoke test.

## Verification

Run from `digdir-norwegian-law-mcp/`:

```bash
npm run build
npm test
npm run smoke:stdio
npm run validate
```

Manual:

- Use one MCP client to call each MVP tool once.
- Confirm responses are JSON text and include `_metadata`.

## Done Criteria

- `npm run validate` passes.
- Each MVP tool has at least one happy-path and one failure-path test.
- Citation parsing and formatting are covered.
- PublicData XML normalization is covered by local fixtures.
- Manual MCP smoke test has been completed once.
