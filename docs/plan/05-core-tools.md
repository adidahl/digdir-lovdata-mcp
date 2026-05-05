# 05 - Core Tools

## Goal

Implement the first current-law research tools for Digdir Norwegian Law MCP.

The result should be a usable local MCP server for searching current laws and
central regulations, resolving titles, retrieving documents or sections, and
validating or formatting citations.

## Scope

In scope:

- `about`
- `list_sources`
- `search_legislation`
- `find_by_title`
- `get_document`
- `get_provision`
- `check_currency`
- `validate_citation`
- `format_citation`
- shared metadata, FTS query helpers, and citation helpers.

Out of scope:

- `build_legal_stance`.
- Historical `as_of_date` answers.
- EU tools.
- Case-law tools.
- Preparatory works tools.

## Implementation Steps

1. Add shared utilities:

   - `src/utils/fts-query.ts`
   - `src/utils/metadata.ts`
   - `src/utils/citation.ts`
   - `src/utils/statute-id.ts`

2. Add citation modules:

   - `src/citation/parser.ts`
   - `src/citation/formatter.ts`
   - `src/citation/validator.ts`

3. Keep Norwegian current-law citation support only:

   - Lovdata IDs such as `LOV-2018-06-15-38`.
   - section references such as `§ 5`.
   - optional `kapittel X`.
   - direct `provision_ref` for exact database lookup.

4. Add `search_legislation`:

   - FTS5 search over `legal_provisions`.
   - return document ID, document title, document type, source dataset,
     provision ref, heading, path, snippet, source URL, and relevance.
   - support filters:
     - `document_type`: `lov` or `forskrift`.
     - `source_dataset`.
     - `department`.
     - `legal_area`.
   - default limit `10`, max `50`.

5. Add `find_by_title`:

   - FTS5 search over `document_title_fts`.
   - search `title` and `short_title`.
   - return stable IDs and source metadata.
   - use this when a user says "arbeidsmiljoloven", "straffeloven", or a
     regulation title instead of a Lovdata ID.

6. Add `get_document`:

   - retrieve one full current law/regulation by ID.
   - include document metadata and ordered sections.
   - default to a safe section limit if needed to avoid huge responses.

7. Add `get_provision`:

   - retrieve a specific section by `document_id` and `provision_ref`.
   - include heading, path, full text, source URL, and source archive metadata.
   - return `null` with metadata if not found.

8. Add `check_currency`:

   - answer whether the document exists in the current consolidated publicData
     dataset.
   - include `archive_last_modified`, `last_change_in_force`, and
     `last_changed_by`.
   - explicitly state that historical consolidated versions are not available
     in the MVP.

9. Add `validate_citation` and `format_citation`:

   - validate document and section existence against SQLite.
   - format supported Lovdata IDs and section references.
   - reject unsupported Swedish, EU, case-law, and preparatory-work formats.

10. Update `src/tools/registry.ts`:

    - advertise exactly the nine MVP tools listed in Scope.
    - route each tool name to its implementation.
    - return JSON text content from each tool.

11. Ensure all tool responses include:

    - `results`.
    - `_metadata`.
    - source/verification disclaimer.
    - NLOD/Lovdata attribution where relevant.

## Verification

Automated:

```bash
npm run build
npm run build:db
npm test -- tests/tools/search-legislation.test.ts
npm test -- tests/tools/find-by-title.test.ts
npm test -- tests/tools/get-document.test.ts
npm test -- tests/tools/get-provision.test.ts
npm test -- tests/tools/check-currency.test.ts
npm test -- tests/tools/validate-citation.test.ts
npm test -- tests/tools/format-citation.test.ts
npm run smoke:stdio
```

Manual MCP prompts:

- "Search Norwegian legislation for personopplysninger."
- "Find the Lovdata ID for straffeloven."
- "Get document LOV-2018-06-15-38."
- "Get LOV-2018-06-15-38 § 5."
- "Is LOV-2018-06-15-38 in the current Lovdata publicData dataset?"
- "Validate LOV-2018-06-15-38 § 5."
- "Format LOV-2018-06-15-38 § 5 as a short citation."

## Done Criteria

- All nine MVP tools are advertised.
- Each MVP tool is callable through stdio.
- Search works across laws and central regulations.
- Title resolution returns stable Lovdata IDs.
- Document retrieval and section retrieval are deterministic.
- Currency checks do not imply historical coverage.
- Invalid citations and missing sections fail safely.
- No EU, case-law, or preparatory works tools are advertised.
