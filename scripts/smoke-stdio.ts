#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ToolTextResult {
  content?: Array<{
    type: string;
    text?: string;
  }>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(PROJECT_ROOT, 'dist', 'index.js')],
    cwd: PROJECT_ROOT,
    stderr: 'pipe',
  });
  let stderr = '';

  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });

  const client = new Client(
    {
      name: 'digdir-norwegian-law-smoke',
      version: '0.1.0',
    },
    {
      capabilities: {},
    },
  );

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();

    assert.deepEqual(toolNames, [
      'about',
      'check_currency',
      'find_by_title',
      'format_citation',
      'get_document',
      'get_document_change_publications',
      'get_lovtidend_publication',
      'get_provision',
      'list_sources',
      'search_legislation',
      'search_lovtidend',
      'validate_citation',
    ]);

    const about = await callJsonTool(client, 'about', {}) as {
      results?: { name?: unknown; jurisdiction?: unknown };
      _metadata?: unknown;
    };
    assert.equal(about.results?.name, 'digdir-norwegian-law');
    assert.equal(about.results?.jurisdiction, 'NO');
    assert.ok(about._metadata);

    const sources = await callJsonTool(client, 'list_sources', {}) as {
      results?: { items?: unknown };
      _metadata?: unknown;
    };
    assert.ok(Array.isArray(sources.results?.items));
    assert.ok(sources._metadata);

    const toolSmokeCases: Array<{
      name: string;
      arguments: Record<string, unknown>;
    }> = [
      {
        name: 'search_legislation',
        arguments: { query: 'personopplysninger', limit: 1 },
      },
      {
        name: 'find_by_title',
        arguments: { query: 'personopplysningsloven', limit: 1 },
      },
      {
        name: 'get_document',
        arguments: { document_id: 'LOV-2018-06-15-38', section_limit: 1 },
      },
      {
        name: 'get_provision',
        arguments: { document_id: 'LOV-2018-06-15-38', provision_ref: '1' },
      },
      {
        name: 'check_currency',
        arguments: { document_id: 'LOV-2018-06-15-38', provision_ref: '1' },
      },
      {
        name: 'validate_citation',
        arguments: { citation: 'LOV-2018-06-15-38 § 1' },
      },
      {
        name: 'format_citation',
        arguments: {
          document_id: 'LOV-2018-06-15-38',
          provision_ref: '1',
        },
      },
      {
        name: 'search_lovtidend',
        arguments: { query: 'endring', limit: 1 },
      },
      {
        name: 'get_lovtidend_publication',
        arguments: { publication_id: 'LOV-2026-01-23-1' },
      },
      {
        name: 'get_document_change_publications',
        arguments: { document_id: 'LOV-2018-06-15-38', limit: 1 },
      },
    ];

    for (const smokeCase of toolSmokeCases) {
      const payload = await callJsonTool(
        client,
        smokeCase.name,
        smokeCase.arguments,
      ) as Record<string, unknown>;

      assert.ok('results' in payload, `${smokeCase.name} missing results`);
      assert.ok(payload._metadata, `${smokeCase.name} missing _metadata`);
    }

    console.log(
      'Stdio smoke test passed: all MVP and Lovtidend tools are listed and basic tools are callable.',
    );
  } catch (error) {
    if (stderr.trim() !== '') {
      console.error(stderr.trim());
    }

    throw error;
  } finally {
    await client.close();
  }
}

async function callJsonTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return readJsonToolResult(
    await client.callTool({ name, arguments: args }),
    name,
  );
}

function readJsonToolResult(result: ToolTextResult, toolName: string): unknown {
  const firstText = result.content?.find((item) => item.type === 'text')?.text;

  assert.ok(firstText, `${toolName} did not return text content`);

  return JSON.parse(firstText);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
