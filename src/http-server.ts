#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  createMcpRuntime,
  openReadOnlyDatabase,
  readPackageVersion,
  resolveDatabasePath,
  SERVER_NAME,
} from './runtime.js';
import type { McpRuntime } from './runtime.js';

interface HttpSession {
  id?: string;
  runtime: McpRuntime;
  transport: StreamableHTTPServerTransport;
}

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';
const startedAt = process.hrtime.bigint();
const sessions = new Map<string, HttpSession>();

async function main(): Promise<void> {
  const port = readPort();
  const host = process.env.HOST?.trim() || DEFAULT_HOST;
  const serverVersion = readPackageVersion();
  const httpServer = http.createServer((req, res) => {
    void handleRequest(req, res, serverVersion).catch((error: unknown) => {
      if (!res.headersSent) {
        setCorsHeaders(res);
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : 'Internal server error',
        });
        return;
      }

      res.destroy(error instanceof Error ? error : undefined);
    });
  });

  httpServer.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  httpServer.listen(port, host, () => {
    const address = httpServer.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;

    console.error(
      `${SERVER_NAME} HTTP server listening on http://${host}:${boundPort}`,
    );
  });

  const shutdown = async (): Promise<void> => {
    await Promise.all(
      [...sessions.values()].map((session) => closeSession(session)),
    );

    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  };

  process.once('SIGINT', () => {
    void shutdown().finally(() => {
      process.exit(0);
    });
  });
  process.once('SIGTERM', () => {
    void shutdown().finally(() => {
      process.exit(0);
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  serverVersion: string,
): Promise<void> {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    sendEmpty(res, 204);
    return;
  }

  const requestUrl = new URL(
    req.url ?? '/',
    `http://${req.headers.host ?? 'localhost'}`,
  );

  if (requestUrl.pathname === '/health') {
    handleHealth(res, serverVersion);
    return;
  }

  if (requestUrl.pathname === '/mcp') {
    await handleMcpRequest(req, res);
    return;
  }

  sendJson(res, 404, {
    error: 'Not found',
  });
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isMcpMethod(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
    sendJsonRpcError(res, 405, -32000, 'Method not allowed.');
    return;
  }

  const sessionId = getHeader(req.headers, 'mcp-session-id');

  if (sessionId) {
    const session = sessions.get(sessionId);

    if (!session) {
      sendJsonRpcError(res, 404, -32001, 'Session not found');
      return;
    }

    await session.transport.handleRequest(req, res);
    return;
  }

  if (req.method !== 'POST') {
    sendJsonRpcError(
      res,
      400,
      -32000,
      'Bad Request: Mcp-Session-Id header is required',
    );
    return;
  }

  const session = await createHttpSession();

  try {
    await session.transport.handleRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      sendJsonRpcError(
        res,
        500,
        -32603,
        error instanceof Error ? error.message : 'Internal server error',
      );
    } else {
      res.destroy(error instanceof Error ? error : undefined);
    }
  } finally {
    if (!session.id || !sessions.has(session.id)) {
      await closeSession(session);
    }
  }
}

async function createHttpSession(): Promise<HttpSession> {
  let session: HttpSession;
  const runtime = createMcpRuntime();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: (sessionId) => {
      session.id = sessionId;
      sessions.set(sessionId, session);
    },
  });

  session = {
    runtime,
    transport,
  };

  transport.onclose = () => {
    if (session.id) {
      sessions.delete(session.id);
    }
  };

  await runtime.server.connect(transport);

  return session;
}

async function closeSession(session: HttpSession): Promise<void> {
  if (session.id) {
    sessions.delete(session.id);
  }

  try {
    await session.runtime.server.close();
  } finally {
    session.runtime.closeDatabase();
  }
}

function handleHealth(res: ServerResponse, serverVersion: string): void {
  const dbPath = resolveDatabasePath();

  try {
    const db = openReadOnlyDatabase(dbPath);

    try {
      db.prepare('SELECT 1').get();
    } finally {
      db.close();
    }

    sendJson(res, 200, {
      status: 'ok',
      server: SERVER_NAME,
      version: serverVersion,
      uptime_seconds: getUptimeSeconds(),
      database: {
        status: 'ok',
      },
    });
  } catch (error) {
    sendJson(res, 503, {
      status: 'error',
      server: SERVER_NAME,
      version: serverVersion,
      uptime_seconds: getUptimeSeconds(),
      database: {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown database error',
      },
    });
  }
}

function getUptimeSeconds(): number {
  const elapsedNanoseconds = process.hrtime.bigint() - startedAt;

  return Number(elapsedNanoseconds / 1_000_000_000n);
}

function isMcpMethod(method: string | undefined): method is 'GET' | 'POST' | 'DELETE' {
  return method === 'GET' || method === 'POST' || method === 'DELETE';
}

function readPort(): number {
  const rawPort = process.env.PORT;

  if (!rawPort || rawPort.trim() === '') {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return port;
}

function getHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    [
      'Accept',
      'Content-Type',
      'Last-Event-ID',
      'Mcp-Protocol-Version',
      'Mcp-Session-Id',
    ].join(', '),
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendEmpty(res: ServerResponse, statusCode: number): void {
  res.writeHead(statusCode, {
    'Content-Length': '0',
  });
  res.end();
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendJsonRpcError(
  res: ServerResponse,
  statusCode: number,
  code: number,
  message: string,
): void {
  sendJson(res, statusCode, {
    jsonrpc: '2.0',
    error: {
      code,
      message,
    },
    id: null,
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
