import {
  isLovdataDocumentId,
  normalizeDocumentId,
} from '../utils/statute-id.js';
import { normalizeProvisionRef } from '../utils/citation.js';

export interface ParsedCitation {
  raw: string;
  valid: boolean;
  document_id?: string;
  chapter?: string;
  provision_ref?: string;
  error?: string;
}

const UNSUPPORTED_PATTERNS: Array<[RegExp, string]> = [
  [/^(?:sfs|\d{4}:\d+)/iu, 'Swedish SFS citations are not supported by this Norway-only MVP.'],
  [/^(?:eu|eøs|forordning|directive|regulation)\b/iu, 'EU citations are outside the MVP scope.'],
  [/^(?:hr|la|lb|le|rt\.|ting)-?/iu, 'Case-law citations are outside the MVP scope.'],
  [/^(?:prop\.|ot\.prp\.|nou)\b/iu, 'Preparatory-work citations are outside the MVP scope.'],
];

const CITATION_PATTERN =
  /^(?<documentId>(?:lov|for)-\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)?)(?:\s+(?:kapittel|kap\.?)\s+(?<chapter>[\w.-]+))?(?:\s+(?<provision>§+\s*[\w.-]+|[\d]+(?:-[\w]+)?[a-z]?))?\s*$/iu;

export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();

  if (trimmed === '') {
    return {
      raw: citation,
      valid: false,
      error: 'Citation is empty.',
    };
  }

  for (const [pattern, error] of UNSUPPORTED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        raw: citation,
        valid: false,
        error,
      };
    }
  }

  const match = trimmed.match(CITATION_PATTERN);

  if (!match?.groups) {
    return {
      raw: citation,
      valid: false,
      error:
        'Unsupported citation format. Use a Lovdata ID such as LOV-2018-06-15-38, optionally followed by kapittel X and § Y.',
    };
  }

  const documentId = normalizeDocumentId(match.groups.documentId);

  if (!isLovdataDocumentId(documentId)) {
    return {
      raw: citation,
      valid: false,
      error: 'Unsupported document identifier.',
    };
  }

  return {
    raw: citation,
    valid: true,
    document_id: documentId,
    ...(match.groups.chapter ? { chapter: match.groups.chapter } : {}),
    ...(match.groups.provision
      ? { provision_ref: normalizeProvisionRef(match.groups.provision) }
      : {}),
  };
}
