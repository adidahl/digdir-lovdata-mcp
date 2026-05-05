import type Database from 'better-sqlite3';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { createToolResponse, jsonToolResult } from '../utils/metadata.js';

const EMPTY_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} satisfies Tool['inputSchema'];

export const LIST_SOURCES_TOOL: Tool = {
  name: 'list_sources',
  title: 'List Sources',
  description:
    'Return the Lovdata publicData source, included datasets, license note, update policy, and verification requirement.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export function callListSourcesTool(db: Database.Database): CallToolResult {
  const sources = {
    source_count: 1,
    items: [
      {
        id: 'lovdata-publicdata',
        name: 'Lovdata publicData',
        publisher: 'Stiftelsen Lovdata',
        acquisition: {
          list_endpoint: 'https://api.lovdata.no/v1/publicData/list',
          get_endpoint_base: 'https://api.lovdata.no/v1/publicData/get',
        },
        license: {
          name: 'Norsk lisens for offentlige data (NLOD) 2.0',
          url: 'https://data.norge.no/nlod/no/2.0',
          note:
            'Data is sourced from Lovdata publicData and processed, parsed, chunked, and indexed by Digdir Norwegian Law MCP.',
        },
        datasets: [
          {
            id: 'gjeldende-lover',
            archive_filename: 'gjeldende-lover.tar.bz2',
            description: 'Current consolidated Norwegian acts.',
          },
          {
            id: 'gjeldende-sentrale-forskrifter',
            archive_filename: 'gjeldende-sentrale-forskrifter.tar.bz2',
            description: 'Current consolidated central Norwegian regulations.',
          },
          {
            id: 'lovtidend-avd1',
            archive_filename: 'lovtidend-avd1-*.tar.bz2',
            description:
              'Norsk Lovtidend avd. I official publication and change provenance archives.',
          },
        ],
        coverage:
          'MVP text coverage is current laws and current central regulations; Lovtidend avd. I is provenance coverage only.',
        update_policy:
          'Refresh Lovdata publicData list, download archives whose size or lastModified changed, normalize current-law XML and Lovtidend provenance XML, and rebuild the bundled SQLite index.',
        verification_requirement:
          'Verify against Lovdata or other official sources before legal reliance.',
      },
    ],
  };

  return jsonToolResult(createToolResponse(db, sources));
}
