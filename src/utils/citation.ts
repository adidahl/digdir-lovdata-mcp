export interface CitationMetadata {
  canonical_ref: string;
  display_text: string;
  source_url?: string;
  lookup: {
    tool: string;
    args: Record<string, string>;
  };
}

export function normalizeProvisionRef(input: string): string {
  const trimmed = input.trim();

  if (trimmed === '') {
    return '';
  }

  const withoutParagraph = trimmed
    .replace(/^§+\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim();

  return withoutParagraph.startsWith('§')
    ? withoutParagraph
    : `§ ${withoutParagraph}`;
}

export function formatLovdataCitation(
  documentId: string,
  provisionRef?: string,
  chapter?: string,
  format: 'full' | 'short' | 'pinpoint' = 'short',
): string {
  const normalizedProvision = provisionRef
    ? normalizeProvisionRef(provisionRef)
    : undefined;
  const pinpoint = [
    chapter ? `kapittel ${chapter}` : undefined,
    normalizedProvision,
  ]
    .filter(Boolean)
    .join(' ');

  if (format === 'pinpoint') {
    return pinpoint || documentId;
  }

  if (format === 'full') {
    return ['Lovdata', documentId, pinpoint].filter(Boolean).join(' ');
  }

  return [documentId, pinpoint].filter(Boolean).join(' ');
}

export function buildProvisionCitation(
  documentId: string,
  provisionRef: string,
  sourceUrl: string,
): CitationMetadata {
  const displayText = formatLovdataCitation(documentId, provisionRef, undefined, 'short');

  return {
    canonical_ref: documentId,
    display_text: displayText,
    source_url: sourceUrl,
    lookup: {
      tool: 'get_provision',
      args: {
        document_id: documentId,
        provision_ref: normalizeProvisionRef(provisionRef),
      },
    },
  };
}
