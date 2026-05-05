export type SourceDataset =
  | 'gjeldende-lover'
  | 'gjeldende-sentrale-forskrifter';

export type PublicDataDataset = SourceDataset | 'lovtidend-avd1';

export type NormalizedDocumentType = 'lov' | 'forskrift';

export type LovtidendDocumentKind = 'lov' | 'forskrift' | 'unknown';

export type LovtidendReferenceType = 'changes_to_document' | 'based_on';

export type LovtidendChangeOperation = 'change' | 'repeal' | 'add' | 'move';

export interface NormalizedSection {
  section_id: string;
  provision_ref: string;
  heading?: string;
  path: string[];
  text: string;
  xml_path?: string;
}

export interface NormalizedDocument {
  id: string;
  source_dataset: SourceDataset;
  archive_filename: string;
  archive_last_modified: string;
  document_type: NormalizedDocumentType;
  title: string;
  short_title?: string;
  department?: string;
  legal_area?: string;
  date_in_force?: string;
  last_change_in_force?: string;
  last_changed_by?: string;
  lovdata_refid?: string;
  source_url: string;
  raw_xml_sha256: string;
  sections: NormalizedSection[];
}

export interface NormalizedLovtidendReference {
  reference_type: LovtidendReferenceType;
  target_ref: string;
  target_document_id?: string;
  target_kind?: LovtidendDocumentKind;
}

export interface NormalizedLovtidendChangePart {
  operation: LovtidendChangeOperation;
  target_ref: string;
  target_document_id?: string;
  document_change_ref?: string;
  text: string;
  element_id?: string;
  xml_path?: string;
}

export interface NormalizedLovtidendPublication {
  publication_id: string;
  refid: string;
  dokid?: string;
  title: string;
  short_title?: string;
  document_kind: LovtidendDocumentKind;
  department?: string;
  date_in_force?: string;
  publication_date?: string;
  journal_number?: string;
  source_archive_filename: string;
  archive_last_modified: string;
  source_url: string;
  source_xml_path?: string;
  raw_xml_sha256: string;
  full_text: string;
  references: NormalizedLovtidendReference[];
  change_parts: NormalizedLovtidendChangePart[];
}
