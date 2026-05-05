#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpRuntime } from './runtime.js';

async function main(): Promise<void> {
  const runtime = createMcpRuntime();

  const shutdown = async (): Promise<void> => {
    try {
      await runtime.server.close();
    } finally {
      runtime.closeDatabase();
    }
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

  await runtime.server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
