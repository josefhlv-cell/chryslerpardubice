export type WowContentKind = "help" | "diagnosis" | "manual" | "wizard";

export type WowContentRecord = {
  id: string;
  kind: WowContentKind;
  fileName: string;
  title: string;
  excerpt: string;
  extension: string;
  url: string;
  tags: string[];
  size: number;
};

export type WowContentIndex = {
  version: number;
  recordCount: number;
  records: WowContentRecord[];
};

export type WowFullContentManifest = {
  version: number;
  generatedAt: string;
  helpDocuments: number;
  helpMedia: number;
  diagnosisRecords: number;
  manualImages: number;
  wizardImages: number;
  rawDataFiles: number;
  rawImageStoreFiles: number;
  notes: string[];
};

let helpPromise: Promise<WowContentIndex> | null = null;
let mediaPromise: Promise<WowContentIndex> | null = null;
let manifestPromise: Promise<WowFullContentManifest> | null = null;

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json() as Promise<T>;
}

export function loadWowFullHelpIndex() {
  helpPromise ??= loadJson<WowContentIndex>("/delphi/wow/help-content-index.json");
  return helpPromise;
}

export function loadWowMediaIndex() {
  mediaPromise ??= loadJson<WowContentIndex>("/delphi/wow/media-index.json");
  return mediaPromise;
}

export function loadWowFullContentManifest() {
  manifestPromise ??= loadJson<WowFullContentManifest>("/delphi/wow/full-content-manifest.json");
  return manifestPromise;
}

export function isHtmlRecord(record: WowContentRecord) {
  return record.extension === "html" || record.extension === "htm";
}

export function isImageRecord(record: WowContentRecord) {
  return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(record.extension);
}
