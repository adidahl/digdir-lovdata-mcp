import { formatLovdataCitation } from '../utils/citation.js';
import type { ParsedCitation } from './parser.js';

export type CitationFormat = 'full' | 'short' | 'pinpoint';

export function formatParsedCitation(
  citation: ParsedCitation,
  format: CitationFormat = 'short',
): string {
  if (!citation.valid || !citation.document_id) {
    return citation.raw;
  }

  return formatLovdataCitation(
    citation.document_id,
    citation.provision_ref,
    citation.chapter,
    format,
  );
}
