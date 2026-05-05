import type Database from 'better-sqlite3';
import {
  ErrorCode,
  McpError,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  buildProvisionCitation,
  normalizeProvisionRef,
} from '../utils/citation.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';
import { resolveDocumentId } from '../utils/statute-id.js';
import {
  parseJsonArray,
  readOptionalString,
  readRequiredString,
} from './input.js';

interface ProvisionRow {
  document_id: string;
  document_title: string;
  document_type: string;
  source_dataset: string;
  archive_filename: string;
  archive_last_modified: string;
  source_url: string;
  raw_xml_sha256: string;
  provision_ref: string;
  section_id: string;
  heading: string | null;
  path: string;
  content: string;
  xml_path: string | null;
}

export const GET_PROVISION_TOOL: Tool = {
  name: 'get_provision',
  title: 'Get Provision',
  description:
    'Retrieve a specific current provision by document ID and provision reference.',
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

export function callGetProvisionTool(
  db: Database.Database,
  args: Record<string, unknown>,
): CallToolResult {
  const inputDocumentId = readRequiredString(args, 'document_id');
  const inputProvision =
    readOptionalString(args, 'provision_ref') ??
    readOptionalString(args, 'section');

  if (!inputProvision) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'provision_ref or section is required.',
    );
  }

  const documentId = resolveDocumentId(db, inputDocumentId);
  const provisionRef = normalizeProvisionRef(inputProvision);

  if (!documentId) {
    return jsonToolResult(
      createToolResponse(
        db,
        {
          found: false,
          document_id: null,
          provision_ref: provisionRef,
          provision: null,
        },
        `No current publicData document found for "${inputDocumentId}".`,
      ),
    );
  }

  const row = db
    .prepare<[string, string], ProvisionRow>(`
      SELECT
        lp.document_id,
        ld.title AS document_title,
        ld.type AS document_type,
        ld.source_dataset,
        ld.archive_filename,
        ld.archive_last_modified,
        ld.source_url,
        ld.raw_xml_sha256,
        lp.provision_ref,
        lp.section_id,
        lp.heading,
        lp.path,
        lp.content,
        lp.xml_path
      FROM legal_provisions lp
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE lp.document_id = ? AND lp.provision_ref = ?
      LIMIT 1
    `)
    .get(documentId, provisionRef);

  if (!row) {
    return jsonToolResult(
      createToolResponse(db, {
        found: false,
        document_id: documentId,
        provision_ref: provisionRef,
        provision: null,
      }),
    );
  }

  return jsonToolResult({
    ...createToolResponse(db, {
      found: true,
      document_id: row.document_id,
      document_title: row.document_title,
      document_type: row.document_type,
      source_dataset: row.source_dataset,
      archive_filename: row.archive_filename,
      archive_last_modified: row.archive_last_modified,
      source_url: row.source_url,
      raw_xml_sha256: row.raw_xml_sha256,
      provision_ref: row.provision_ref,
      section_id: row.section_id,
      heading: row.heading,
      path: parseJsonArray(row.path),
      content: row.content,
      xml_path: row.xml_path,
    }),
    _citation: buildProvisionCitation(
      row.document_id,
      row.provision_ref,
      row.source_url,
    ),
  });
}
