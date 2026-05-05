import type Database from 'better-sqlite3';
import { parseCitation, type ParsedCitation } from './parser.js';

interface DocumentRow {
  id: string;
  title: string;
  status: string;
}

interface ProvisionRow {
  id: number;
}

export interface CitationValidationResult {
  citation: ParsedCitation;
  valid: boolean;
  document_exists: boolean;
  provision_exists: boolean | null;
  document_title?: string;
  status?: string;
  warnings: string[];
}

export function validateCitation(
  db: Database.Database,
  citation: string,
): CitationValidationResult {
  return validateParsedCitation(db, parseCitation(citation));
}

export function validateParsedCitation(
  db: Database.Database,
  citation: ParsedCitation,
): CitationValidationResult {
  if (!citation.valid || !citation.document_id) {
    return {
      citation,
      valid: false,
      document_exists: false,
      provision_exists: null,
      warnings: [citation.error ?? 'Citation is invalid.'],
    };
  }

  const document = db
    .prepare<[string], DocumentRow>(
      'SELECT id, title, status FROM legal_documents WHERE id = ?',
    )
    .get(citation.document_id);

  if (!document) {
    return {
      citation,
      valid: false,
      document_exists: false,
      provision_exists: citation.provision_ref ? false : null,
      warnings: [`Document "${citation.document_id}" was not found in the current publicData dataset.`],
    };
  }

  if (!citation.provision_ref) {
    return {
      citation,
      valid: true,
      document_exists: true,
      provision_exists: null,
      document_title: document.title,
      status: document.status,
      warnings: [],
    };
  }

  const provision = db
    .prepare<[string, string], ProvisionRow>(
      'SELECT id FROM legal_provisions WHERE document_id = ? AND provision_ref = ?',
    )
    .get(citation.document_id, citation.provision_ref);

  return {
    citation,
    valid: Boolean(provision),
    document_exists: true,
    provision_exists: Boolean(provision),
    document_title: document.title,
    status: document.status,
    warnings: provision
      ? []
      : [
          `Provision "${citation.provision_ref}" was not found in document "${citation.document_id}".`,
        ],
  };
}
