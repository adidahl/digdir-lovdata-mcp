import type Database from 'better-sqlite3';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  formatParsedCitation,
  type CitationFormat,
} from '../citation/formatter.js';
import { parseCitation } from '../citation/parser.js';
import { formatLovdataCitation, normalizeProvisionRef } from '../utils/citation.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';
import {
  isLovdataDocumentId,
  normalizeDocumentId,
} from '../utils/statute-id.js';
import {
  readOptionalEnum,
  readOptionalString,
} from './input.js';

export const FORMAT_CITATION_TOOL: Tool = {
  name: 'format_citation',
  title: 'Format Citation',
  description:
    'Format a supported Lovdata document ID and optional provision reference.',
  inputSchema: {
    type: 'object',
    properties: {
      citation: { type: 'string' },
      document_id: { type: 'string' },
      provision_ref: { type: 'string' },
      section: { type: 'string' },
      chapter: { type: 'string' },
      format: { type: 'string', enum: ['full', 'short', 'pinpoint'] },
    },
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export function callFormatCitationTool(
  db: Database.Database,
  args: Record<string, unknown>,
): CallToolResult {
  const format = readOptionalEnum<CitationFormat>(args, 'format', [
    'full',
    'short',
    'pinpoint',
  ]) ?? 'short';
  const citation = readOptionalString(args, 'citation');

  if (citation) {
    const parsed = parseCitation(citation);
    return jsonToolResult(
      createToolResponse(db, {
        valid: parsed.valid,
        parsed,
        formatted: formatParsedCitation(parsed, format),
        warnings: parsed.valid ? [] : [parsed.error ?? 'Citation is invalid.'],
      }),
    );
  }

  const documentId = readOptionalString(args, 'document_id');

  if (!documentId) {
    return jsonToolResult(
      createToolResponse(db, {
        valid: false,
        formatted: null,
        warnings: ['citation or document_id is required.'],
      }),
    );
  }

  const normalizedDocumentId = normalizeDocumentId(documentId);

  if (!isLovdataDocumentId(normalizedDocumentId)) {
    return jsonToolResult(
      createToolResponse(db, {
        valid: false,
        formatted: null,
        warnings: [
          'Only Lovdata document IDs such as LOV-2018-06-15-38 and FOR-2018-06-15-876 are supported.',
        ],
      }),
    );
  }

  const provision =
    readOptionalString(args, 'provision_ref') ??
    readOptionalString(args, 'section');
  const formatted = formatLovdataCitation(
    normalizedDocumentId,
    provision ? normalizeProvisionRef(provision) : undefined,
    readOptionalString(args, 'chapter'),
    format,
  );

  return jsonToolResult(
    createToolResponse(db, {
      valid: true,
      formatted,
      document_id: normalizedDocumentId,
      provision_ref: provision ? normalizeProvisionRef(provision) : null,
      format,
    }),
  );
}
