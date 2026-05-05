import type Database from 'better-sqlite3';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { normalizeProvisionRef } from '../utils/citation.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';
import { resolveDocumentId } from '../utils/statute-id.js';
import {
  readOptionalString,
  readRequiredString,
} from './input.js';

interface DocumentRow {
  id: string;
  title: string;
  type: string;
  source_dataset: string;
  archive_filename: string;
  archive_last_modified: string;
  status: string;
  date_in_force: string | null;
  last_change_in_force: string | null;
  last_changed_by: string | null;
  source_url: string;
  last_updated: string;
}

export const CHECK_CURRENCY_TOOL: Tool = {
  name: 'check_currency',
  title: 'Check Currency',
  description:
    'Check whether a document or provision exists in the current Lovdata publicData corpus.',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: { type: 'string' },
      provision_ref: { type: 'string' },
      section: { type: 'string' },
    },
    required: ['document_id'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export function callCheckCurrencyTool(
  db: Database.Database,
  args: Record<string, unknown>,
): CallToolResult {
  const inputDocumentId = readRequiredString(args, 'document_id');
  const inputProvision =
    readOptionalString(args, 'provision_ref') ??
    readOptionalString(args, 'section');
  const documentId = resolveDocumentId(db, inputDocumentId);

  if (!documentId) {
    return jsonToolResult(
      createToolResponse(db, {
        document_exists: false,
        is_current: false,
        document_id: null,
        requested_document_id: inputDocumentId,
        historical_versions_available: false,
        warning:
          'Historical consolidated versions are not available in this MVP.',
      }),
    );
  }

  const document = db
    .prepare<[string], DocumentRow>(`
      SELECT
        id,
        title,
        type,
        source_dataset,
        archive_filename,
        archive_last_modified,
        status,
        date_in_force,
        last_change_in_force,
        last_changed_by,
        source_url,
        last_updated
      FROM legal_documents
      WHERE id = ?
      LIMIT 1
    `)
    .get(documentId);

  if (!document) {
    return jsonToolResult(
      createToolResponse(db, {
        document_exists: false,
        is_current: false,
        document_id: documentId,
        requested_document_id: inputDocumentId,
        historical_versions_available: false,
      }),
    );
  }

  const provisionRef = inputProvision
    ? normalizeProvisionRef(inputProvision)
    : undefined;
  const provisionExists = provisionRef
    ? Boolean(
        db
          .prepare<[string, string]>(
            'SELECT 1 FROM legal_provisions WHERE document_id = ? AND provision_ref = ?',
          )
          .get(document.id, provisionRef),
      )
    : undefined;

  return jsonToolResult(
    createToolResponse(db, {
      document_exists: true,
      is_current: document.status === 'in_force',
      historical_versions_available: false,
      warning:
        'This check only confirms presence in the current consolidated Lovdata publicData dataset. Historical consolidated versions are not available in the MVP.',
      document,
      ...(provisionRef
        ? {
            provision_ref: provisionRef,
            provision_exists: provisionExists,
          }
        : {}),
    }),
  );
}
