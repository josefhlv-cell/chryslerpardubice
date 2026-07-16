export type WowElmSupport =
  | "metadata_only"
  | "candidate_requires_validation"
  | "not_for_elm_without_validation";

export interface WowProtocolRecord {
  id: string;
  startYear: string;
  endYear: string;
  systemName: string;
  systemVariant: string;
  gearbox: string;
  measurementProtocol: string;
  eobdProtocol: string;
  diagnosisProtocol: string;
  blinkProtocol: string;
  obdProtocol: string;
  ecuObd: string;
  parallelProtocol: string;
  ecuParallel: string;
  systemType: string;
  descriptionId: string;
  systemDescriptionId: string;
  ecuDescriptionId: string;
  devices: string;
  brandId: string;
  modelId: string;
  sourceFile: string;
  raw: string[];
  transportHint: string;
  elmSupport: WowElmSupport;
}

export interface WowProtocolCatalog {
  schemaVersion: number;
  generatedFrom: string[];
  recordCount: number;
  records: WowProtocolRecord[];
}

export interface WowHelpRecord {
  id: string;
  fileName: string;
  relativePath: string;
  title: string;
  tags: string[];
  sourceArchive: string;
  contentIncluded: false;
}
