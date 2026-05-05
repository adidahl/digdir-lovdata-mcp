#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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
  const port = await getAvailablePort();
  const child = spawnHttpServer(port);

  try {
    await waitForHealth(port, child);

    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
    );
    const client = new Client(
      {
        name: 'digdir-norwegian-law-http-smoke',
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

      const lovtidendSearch = await callJsonTool(client, 'search_lovtidend', {
        query: 'endring',
        limit: 1,
      }) as Record<string, unknown>;
      assert.ok('results' in lovtidendSearch);
      assert.ok(lovtidendSearch._metadata);

      console.log(
        'HTTP smoke test passed: health is OK and MCP tools are callable over Streamable HTTP.',
      );
    } finally {
      await client.close();
    }
  } finally {
    await stopServer(child);
  }
}

function spawnHttpServer(port: number): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [path.join('dist', 'http-server.js')], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  return child;
}

async function getAvailablePort(): Promise<number> {
  const server = http.createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Could not allocate a local port.');
  }

  const port = address.port;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return port;
}

async function waitForHealth(
  port: number,
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  const url = `http://127.0.0.1:${port}/health`;
  const deadline = Date.now() + 10_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`HTTP server exited early with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(url);

      if (response.ok) {
        const payload = await response.json() as { status?: unknown };

        assert.equal(payload.status, 'ok');
        return;
      }

      lastError = new Error(`Health check returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Timed out waiting for HTTP health check.');
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

async function stopServer(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 2_000);

    timeout.unref();
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
