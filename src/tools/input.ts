import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export function readRequiredString(
  args: Record<string, unknown>,
  key: string,
): string {
  const value = args[key];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new McpError(ErrorCode.InvalidParams, `${key} is required.`);
  }

  return value.trim();
}

export function readOptionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, `${key} must be a string.`);
  }

  return value.trim();
}

export function readOptionalEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = readOptionalString(args, key);

  if (value === undefined) {
    return undefined;
  }

  if (!allowed.includes(value as T)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${key} must be one of: ${allowed.join(', ')}.`,
    );
  }

  return value as T;
}

export function readLimit(
  args: Record<string, unknown>,
  key: string,
  defaultValue: number,
  maxValue: number,
): number {
  const value = args[key];

  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new McpError(ErrorCode.InvalidParams, `${key} must be a number.`);
  }

  return Math.min(Math.max(Math.trunc(value), 1), maxValue);
}

export function readOptionalBoolean(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = args[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new McpError(ErrorCode.InvalidParams, `${key} must be a boolean.`);
  }

  return value;
}

export function parseJsonArray(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;

  return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
    ? parsed
    : [];
}
