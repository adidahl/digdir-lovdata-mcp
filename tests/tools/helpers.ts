import Database from 'better-sqlite3';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createTestDb } from '../fixtures/test-db.js';

export function openTestDb(): Database.Database {
  return createTestDb();
}

export function readToolJson<T>(result: CallToolResult): T {
  const text = result.content.find((item) => item.type === 'text')?.text;

  if (!text) {
    throw new Error('Tool result did not include text content.');
  }

  return JSON.parse(text) as T;
}
