import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Search,
  X,
  Wrench,
  Stethoscope,
  HelpCircle,
  Plug,
  Film,
  Network,
  Filter,
  Globe,
  Car,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  isHtmlRecord,
  isImageRecord,
  loadWowFullContentManifest,
  loadWowFullHelpIndex,
  loadWowMediaIndex,
  loadWowProtocolCatalog,
  type WowContentRecord,
  type WowFullContentManifest,
  type WowProtocolRecord,
} from "@/lib/delphi/wow";
import { partitionByApplicability } from "@/lib/delphi/wow/applicability";
import { WowVehicleProvider, useWowVehicle } from "@/lib/delphi/wow/vehicle-context";
import { WowVehicleSelector } from "./WowVehicleSelector";
import { WowDocumentTree } from "./WowDocumentTree";


export type WowVehicleContext = {
  vin: string | null;
  brandKey: string | null;
  brandLabel: string | null;
  make: string | null;
  model: string | null;
  generation: string | null;
  year: string | null;
  ecuName: string | null;
  ecuAddress: string | null;
  selectedFunction: string | null;
};

type Props = {
  vehicleContext?: WowVehicleContext | null;
};

type SectionKey =
  | "service"
  | "diagnosis"
  | "help"
  | "connector"
  | "media"
  | "protocols";

const SECTION_LABEL: Record<SectionKey, string> = {
  service: "Servisní postupy",
  diagnosis: "Diagnostické postupy",
  help: "Technická nápověda",
  connector: "OBD konektor",
  media: "Obrázky a animace",
  protocols: "Protokoly",
};

const SECTION_ICON: Record<SectionKey, JSX.Element> = {
  service: <Wrench className="h-4 w-4" />,
  diagnosis: <Stethoscope className="h-4 w-4" />,
  help: <HelpCircle className="h-4 w-4" />,
  connector: <Plug className="h-4 w-4" />,
  media: <Film className="h-4 w-4" />,
  protocols: <Network className="h-4 w-4" />,
};

const SERVICE_TERMS = [
  "service","servis","reset","bleed","odvzdušn","install","adaptation","adaptace",
  "kalibrace","calibr","learn","teach","aktivac","activation","clear","test","dpf",
  "egr","injector","vstřik","pumpinst","valve","aktuator"
];

const DIAGNOSIS_TERMS = [
  "diag","selftest","self-test","fauld","fault","dtc","erase","openadp",
  "protocol","measure","ground","kabel","chyb","paralel","short"
];

const CONNECTOR_TERMS = [
  "obd","connector","conector","dlc","pinout","socket","zásuvka","zasuvka","port"
];

function slugify(x: string | null | undefined) {
  return (x || "").toString().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

function textOf(rec: WowContentRecord) {
  return `${rec.title} ${rec.fileName} ${rec.tags.join(" ")} ${rec.excerpt}`.toLowerCase();
}

function classifyRecord(rec: WowContentRecord): SectionKey {
  const t = textOf(rec);
  if (isImageRecord(rec) && !isHtmlRecord(rec)) {
    if (CONNECTOR_TERMS.some((k) => t.includes(k))) return "connector";
    return "media";
  }
  if (rec.kind === "diagnosis") return "diagnosis";
  if (CONNECTOR_TERMS.some((k) => t.includes(k))) return "connector";
  if (DIAGNOSIS_TERMS.some((k) => t.includes(k))) return "diagnosis";
  if (SERVICE_TERMS.some((k) => t.includes(k))) return "service";
  return "help";
}

function vehicleMatches(rec: WowContentRecord, ctx?: WowVehicleContext | null): boolean {
  if (!ctx) return false;
  const parts = [ctx.brandLabel, ctx.brandKey, ctx.make, ctx.model, ctx.generation, ctx.ecuName]
    .map(slugify)
    .filter((x) => x && x.length >= 3);
  if (!parts.length) return false;
  const haystack = slugify(textOf(rec));
  return parts.some((p) => haystack.includes(p));
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} kB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function DocumentViewer({ record, onClose }: { record: WowContentRecord; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isHtmlRecord(record)) return;
    setLoading(true);
    setError(null);
    fetch(record.url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then((raw) => {
        if (cancelled) return;
        // Sanitize: strip <script>, on* handlers, external navigation, and rebase relative asset URLs
        const baseDir = record.url.replace(/[^/]+$/, "");
        let out = raw
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
          .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
          .replace(/\shref\s*=\s*"(?!https?:|mailto:|#|\/)([^"]+)"/gi, ` href="${baseDir}$1"`)
          .replace(/\ssrc\s*=\s*"(?!https?:|data:|\/)([^"]+)"/gi, ` src="${baseDir}$1"`)
          .replace(/\ssrc\s*=\s*'(?!https?:|data:|\/)([^']+)'/gi, ` src='${baseDir}$1'`)
          .replace(/\shref\s*=\s*'(?!https?:|mailto:|#|\/)([^']+)'/gi, ` href='${baseDir}$1'`);
        // Wrap for readable style
        out = `<!doctype html><html><head><meta charset="utf-8"><base href="${baseDir}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
          body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#fff;padding:12px;margin:0;word-wrap:break-word}
          img,video{max-width:100%;height:auto}
          a{color:#2563eb;pointer-events:none;text-decoration:underline}
          table{border-collapse:collapse;max-width:100%}
          td,th{border:1px solid #cbd5e1;padding:4px 8px}
        </style></head><body>${out}</body></html>`;
        setHtml(out);
      })
      .catch((e) => !cancelled && setError(String(e?.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [record]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-2 sm:p-4">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b bg-slate-100 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{record.title}</div>
            <div className="truncate text-[11px] text-slate-500">{record.url}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Zavřít">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-hidden bg-white">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Načítám dokument…
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-rose-700">Nelze načíst dokument: {error}</div>
          ) : isHtmlRecord(record) && html ? (
            <iframe
              title={record.title}
              sandbox=""
              srcDoc={html}
              className="h-full w-full border-0"
            />
          ) : isImageRecord(record) ? (
            <div className="flex h-full items-center justify-center overflow-auto bg-slate-50 p-2">
              <img src={record.url} alt={record.title} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="p-4 text-sm text-slate-600">Nepodporovaný formát: {record.extension}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminDelphiWowInner({ vehicleContext }: Props = {}) {
  const [manifest, setManifest] = useState<WowFullContentManifest | null>(null);
  const [records, setRecords] = useState<WowContentRecord[]>([]);
  const [protocols, setProtocols] = useState<WowProtocolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("service");
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 250);
  const [showAll, setShowAll] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<WowContentRecord | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 40;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, help, media, proto] = await Promise.all([
          loadWowFullContentManifest(),
          loadWowFullHelpIndex(),
          loadWowMediaIndex(),
          loadWowProtocolCatalog().catch(() => ({ records: [] as WowProtocolRecord[] } as any)),
        ]);
        if (cancelled) return;
        setManifest(m);
        setRecords([...help.records, ...media.records]);
        setProtocols((proto as any).records || []);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasVehicleCtx = !!(vehicleContext && (vehicleContext.brandLabel || vehicleContext.make));

  useEffect(() => {
    setPage(1);
  }, [debounced, section, showAll, vehicleContext?.brandKey, vehicleContext?.make, vehicleContext?.model]);

  const categorized = useMemo(() => {
    const map: Record<SectionKey, WowContentRecord[]> = {
      service: [],
      diagnosis: [],
      help: [],
      connector: [],
      media: [],
      protocols: [],
    };
    for (const r of records) map[classifyRecord(r)].push(r);
    return map;
  }, [records]);

  const vehicleScoped = useMemo(() => {
    if (!hasVehicleCtx || showAll) return null;
    const filtered: Record<SectionKey, WowContentRecord[]> = {
      service: [], diagnosis: [], help: [], connector: [], media: [], protocols: [],
    };
    (Object.keys(categorized) as SectionKey[]).forEach((k) => {
      if (k === "protocols") return;
      filtered[k] = categorized[k].filter((r) => vehicleMatches(r, vehicleContext));
    });
    return filtered;
  }, [categorized, vehicleContext, hasVehicleCtx, showAll]);

  const activeSet = vehicleScoped ? vehicleScoped[section] : categorized[section];

  const filtered = useMemo(() => {
    if (section === "protocols") return [];
    const q = debounced.trim().toLowerCase();
    if (!q) return activeSet;
    const tokens = q.split(/\s+/).filter(Boolean);
    return activeSet.filter((r) => {
      const hay = textOf(r);
      return tokens.every((t) => hay.includes(t));
    });
  }, [activeSet, debounced, section]);

  const filteredProtocols = useMemo(() => {
    if (section !== "protocols") return [];
    const q = debounced.trim().toLowerCase();
    let out = protocols;
    if (!showAll && vehicleContext?.brandKey) {
      const brand = slugify(vehicleContext.brandLabel || vehicleContext.brandKey);
      out = out.filter((r) => slugify(r.systemName + r.systemVariant + r.brandId).includes(brand));
    }
    if (q) out = out.filter((r) => `${r.systemName} ${r.systemVariant} ${r.obdProtocol} ${r.diagnosisProtocol}`.toLowerCase().includes(q));
    return out.slice(0, 500);
  }, [protocols, showAll, vehicleContext, debounced, section]);

  const pageStart = (page - 1) * perPage;
  const pageItems = filtered.slice(pageStart, pageStart + perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const openDoc = (r: WowContentRecord) => {
    if (isHtmlRecord(r) || isImageRecord(r)) setSelectedDoc(r);
    else window.open(r.url, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Načítám WOW obsah…
      </div>
    );
  }
  if (error) {
    return <div className="p-4 text-sm text-rose-700">Chyba při načítání: {error}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <Info className="h-3.5 w-3.5" />
          <span>
            WOW/Würth: <b>{manifest?.helpDocuments ?? 0}</b> dok. nápovědy, <b>{manifest?.diagnosisRecords ?? 0}</b> diag. karet, <b>{manifest?.helpMedia ?? 0}</b> médií, <b>{protocols.length.toLocaleString("cs-CZ")}</b> protokolů.
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {hasVehicleCtx ? (
            <Badge variant="secondary" className="gap-1"><Car className="h-3 w-3" /> {vehicleContext?.brandLabel || vehicleContext?.make} {vehicleContext?.model || ""} {vehicleContext?.year || ""}</Badge>
          ) : (
            <Badge variant="outline" className="gap-1"><Filter className="h-3 w-3" /> Bez kontextu vozidla – zobrazeny všechny</Badge>
          )}
          {vehicleContext?.ecuName ? <Badge variant="outline">ECU: {vehicleContext.ecuName}</Badge> : null}
          {vehicleContext?.selectedFunction ? <Badge variant="outline">Fce: {vehicleContext.selectedFunction}</Badge> : null}
          {hasVehicleCtx ? (
            <Button size="sm" variant={showAll ? "default" : "outline"} onClick={() => setShowAll((v) => !v)} className="ml-auto h-7 text-xs">
              <Globe className="mr-1 h-3.5 w-3.5" />
              {showAll ? "Zobrazit jen dokumentaci vozidla" : "Zobrazit dokumentaci všech vozidel"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat: EGR, DPF, adaptace, reset, odvzdušnění, ABS, kalibrace…"
          className="pl-8 text-sm"
        />
      </div>

      {/* Sections */}
      <Tabs value={section} onValueChange={(v) => setSection(v as SectionKey)} className="w-full">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="inline-flex h-auto w-max min-w-full items-stretch gap-1 bg-slate-100 p-1">
            {(Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => {
              const count = k === "protocols" ? filteredProtocols.length : (vehicleScoped ? vehicleScoped[k].length : categorized[k].length);
              return (
                <TabsTrigger key={k} value={k} className="h-9 shrink-0 whitespace-nowrap px-3 text-xs">
                  <span className="inline-flex items-center gap-1">
                    {SECTION_ICON[k]}
                    <span className="hidden sm:inline">{SECTION_LABEL[k]}</span>
                    <span className="sm:hidden">{SECTION_LABEL[k].split(" ")[0]}</span>
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{count}</Badge>
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {(Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => (
          <TabsContent key={k} value={k} className="mt-2">
            {k === "protocols" ? (
              <div ref={listRef} className="max-h-[60vh] overflow-y-auto rounded border border-slate-200">
                {filteredProtocols.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">Žádné protokoly.</div>
                ) : (
                  <ul className="divide-y divide-slate-100 text-xs">
                    {filteredProtocols.map((p) => (
                      <li key={p.id} className="p-2">
                        <div className="font-medium">{p.systemName} {p.systemVariant ? `– ${p.systemVariant}` : ""}</div>
                        <div className="text-slate-500">
                          {p.obdProtocol || p.diagnosisProtocol || "–"} · {p.startYear}–{p.endYear} · ECU {p.ecuObd || "–"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <>
                {filtered.length === 0 ? (
                  <div className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                    {hasVehicleCtx && !showAll
                      ? "Pro vybrané vozidlo v této sekci nebyla nalezena žádná dokumentace. Zvolte „Zobrazit dokumentaci všech vozidel“."
                      : "Nic nenalezeno."}
                  </div>
                ) : (
                  <>
                    <div ref={listRef} className="max-h-[60vh] overflow-y-auto rounded border border-slate-200">
                      <ul className="divide-y divide-slate-100">
                        {pageItems.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => openDoc(r)}
                              className="flex w-full items-start gap-2 p-2 text-left hover:bg-slate-50 active:bg-slate-100"
                            >
                              {isImageRecord(r) && !isHtmlRecord(r) ? (
                                <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                              ) : (
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{r.title}</div>
                                {r.excerpt ? <div className="line-clamp-2 text-xs text-slate-500">{r.excerpt}</div> : null}
                                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                                  <span>{r.fileName}</span>
                                  <span>·</span>
                                  <span>{r.extension.toUpperCase()}</span>
                                  <span>·</span>
                                  <span>{formatBytes(r.size)}</span>
                                  {r.tags.slice(0, 3).map((t) => (
                                    <Badge key={t} variant="outline" className="h-4 px-1 text-[10px]">{t}</Badge>
                                  ))}
                                </div>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {totalPages > 1 ? (
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Předchozí</Button>
                        <span className="text-slate-600">Strana {page} / {totalPages} · celkem {filtered.length}</span>
                        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Další</Button>
                      </div>
                    ) : null}
                  </>
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {selectedDoc ? <DocumentViewer record={selectedDoc} onClose={() => setSelectedDoc(null)} /> : null}
    </div>
  );
}

/**
 * Bridge: when the parent (AdminDelphi) passes a vehicleContext, mirror it into
 * the WowVehicleProvider so applicability / tree filtering all read from ONE
 * shared vehicle. Prevents the duplicate selector the user reported.
 */
function VehicleContextBridge({ ctx }: { ctx?: WowVehicleContext | null }) {
  const { setField, vehicle } = useWowVehicle();
  useEffect(() => {
    if (!ctx) return;
    const year = ctx.year ? Number(ctx.year) : null;
    if ((ctx.make || null) !== vehicle.make) setField("make", ctx.make || null);
    if ((ctx.model || null) !== vehicle.model) setField("model", ctx.model || null);
    if ((ctx.generation || null) !== vehicle.generation) setField("generation", ctx.generation || null);
    if (year !== vehicle.year) setField("year", Number.isFinite(year as number) ? year : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.make, ctx?.model, ctx?.generation, ctx?.year]);
  return null;
}

export default function AdminDelphiWow(props: Props = {}) {
  // When embedded in the Delphi workspace (parent always passes a ctx object, even empty),
  // the main Delphi vehicle selector is the single source of truth — never render our own.
  const embedded = props.vehicleContext !== undefined;
  return (
    <WowVehicleProvider>
      <VehicleContextBridge ctx={props.vehicleContext} />
      <div
        className="flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]"
        data-shared-vehicle={embedded ? "parent" : "local"}
      >
        {!embedded ? <WowVehicleSelector /> : null}
        <AdminDelphiWowInner {...props} />
      </div>
    </WowVehicleProvider>
  );
}


