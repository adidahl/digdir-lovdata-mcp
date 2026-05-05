import type Database from 'better-sqlite3';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';
import { resolveDocumentId } from '../utils/statute-id.js';
import {
  parseJsonArray,
  readLimit,
  readRequiredString,
} from './input.js';

interface DocumentRow {
  id: string;
  source_dataset: string;
  archive_filename: string;
  archive_last_modified: string;
  type: string;
  title: string;
  short_title: string | null;
  department: string | null;
  legal_area: string | null;
  date_in_force: string | null;
  last_change_in_force: string | null;
  last_changed_by: string | null;
  lovdata_refid: string | null;
  source_url: string;
  raw_xml_sha256: string;
  status: string;
  last_updated: string;
}

interface ProvisionRow {
  provision_ref: string;
  section_id: string;
  heading: string | null;
  path: string;
  content: string;
  xml_path: string | null;
}

export const GET_DOCUMENT_TOOL: Tool = {
  name: 'get_document',
  title: 'Get Document',
  description:
    'Retrieve metadata and ordered current sections for one Norwegian law or central regulation.',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: { type: 'string' },
      section_limit: { type: 'number', minimum: 1, maximum: 1000 },
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

export function callGetDocumentTool(
  db: Database.Database,
  args: Record<string, unknown>,
): CallToolResult {
  const inputDocumentId = readRequiredString(args, 'document_id');
  const sectionLimit = readLimit(args, 'section_limit', 200, 1000);
  const documentId = resolveDocumentId(db, inputDocumentId);

  if (!documentId) {
    return jsonToolResult(
      createToolResponse(
        db,
        null,
        `No current publicData document found for "${inputDocumentId}".`,
      ),
    );
  }

  const document = db
    .prepare<[string], DocumentRow>(
      'SELECT * FROM legal_documents WHERE id = ? LIMIT 1',
    )
    .get(documentId);

  if (!document) {
    return jsonToolResult(
      createToolResponse(
        db,
        null,
        `No current publicData document found for "${inputDocumentId}".`,
      ),
    );
  }

  const sections = db
    .prepare<[string, number], ProvisionRow>(`
      SELECT provision_ref, section_id, heading, path, content, xml_path
      FROM legal_provisions
      WHERE document_id = ?
      ORDER BY id
      LIMIT ?
    `)
    .all(document.id, sectionLimit)
    .map((section) => ({
      ...section,
      path: parseJsonArray(section.path),
    }));
  const totalSections = db
    .prepare<[string], { count: number }>(
      'SELECT COUNT(*) AS count FROM legal_provisions WHERE document_id = ?',
    )
    .get(document.id)?.count ?? 0;

  return jsonToolResult(
    createToolResponse(db, {
      document,
      sections,
      section_limit: sectionLimit,
      total_sections: totalSections,
      truncated: totalSections > sections.length,
      resolved_from:
        document.id === inputDocumentId ? undefined : inputDocumentId,
    }),
  );
}
