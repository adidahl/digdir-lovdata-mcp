import type Database from 'better-sqlite3';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { validateCitation } from '../citation/validator.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';
import { readRequiredString } from './input.js';

export const VALIDATE_CITATION_TOOL: Tool = {
  name: 'validate_citation',
  title: 'Validate Citation',
  description:
    'Validate a Norway current-law Lovdata citation against the SQLite corpus.',
  inputSchema: {
    type: 'object',
    properties: {
      citation: { type: 'string' },
    },
    required: ['citation'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export function callValidateCitationTool(
  db: Database.Database,
  args: Record<string, unknown>,
): CallToolResult {
  const citation = readRequiredString(args, 'citation');

  return jsonToolResult(createToolResponse(db, validateCitation(db, citation)));
}
