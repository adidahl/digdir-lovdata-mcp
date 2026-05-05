const FTS_SPECIAL_CHARS = /['"(){}[\]^~:@#$%&+=<>|\\/.!?,;]/gu;

export function sanitizeFtsInput(input: string): string {
  return input
    .replace(FTS_SPECIAL_CHARS, ' ')
    .replace(/\*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function buildFtsQueryVariants(input: string): string[] {
  const sanitized = sanitizeFtsInput(input);
  const tokens = sanitized.split(/\s+/u).filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  const quotedTokens = tokens.map(quoteFtsToken);
  const variants: string[] = [];

  if (tokens.length > 1) {
    variants.push(quoteFtsToken(tokens.join(' ')));
  }

  variants.push(quotedTokens.join(' AND '));
  variants.push(tokens.map((token) => `${quoteFtsToken(token)}*`).join(' AND '));

  if (tokens.length > 1) {
    variants.push(quotedTokens.join(' OR '));
  }

  return [...new Set(variants)];
}

export function buildLikePattern(input: string): string {
  const tokens = sanitizeFtsInput(input).split(/\s+/u).filter(Boolean);
  return tokens.length > 0 ? `%${tokens.join('%')}%` : '%';
}

export function normalizeLookupText(input: string): string {
  return input
    .toLocaleLowerCase('nb-NO')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/æ/gu, 'ae')
    .replace(/ø/gu, 'o')
    .replace(/å/gu, 'a')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function quoteFtsToken(token: string): string {
  return `"${token.replace(/"/gu, '""')}"`;
}
