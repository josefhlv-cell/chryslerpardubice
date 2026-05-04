/**
 * AdminDataFixer — čištění a správa katalogu autodílů.
 *
 * Detekuje logické nesoulady mezi názvem a popisem (Záměna / Nesoulad / Nepřesnost),
 * umožní inline editaci a export vyčištěného CSV.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Search, Filter, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Part = {
  id: string;
  oem_number: string | null;
  name: string | null;
  description: string | null;
  manufacturer: string | null;
  catalog_source: string | null;
};

type ConflictType = "swap" | "mismatch" | "imprecise" | null;

type Analyzed = Part & { conflict: ConflictType; reason: string };

// Slovník klíčových slov → kategorie. Používá se pro detekci konfliktů
// (záměny mezi kategoriemi) a pro odhad nesouladu.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  brzdy: ["brzd", "destič", "kotouč", "třmen", "bremsbelag", "brake"],
  tlumic: ["tlumič", "tlumic", "stossdämpfer", "shock", "damper"],
  vyfuk: ["výfuk", "vyfuk", "tlumič výfuku", "tlumic vyfuku", "katalyz", "exhaust", "muffler"],
  svetlo: ["svítil", "svitil", "světlo", "svetlo", "lampa", "headlight", "tail light", "leuchte"],
  filtr: ["filtr", "filter"],
  motor: ["motor", "engine", "blok motoru", "hlava válců"],
  alternator: ["alternát", "alternator", "lichtmaschine", "generator"],
  startér: ["startér", "starter", "anlasser"],
  senzor: ["senzor", "snímač", "snimac", "sensor", "sonda", "lambda", "klikový hřídel", "klikoveho hridele"],
  spojka: ["spojk", "kupplung", "clutch"],
  rameno: ["rameno", "lenker", "control arm"],
  narazn: ["náraz", "naraz", "stoßfänger", "bumper"],
  ventil: ["ventil", "valve", "expanzní"],
  chladic: ["chladič", "chladic", "kühler", "radiator", "klimat"],
  remen: ["řemen", "remen", "riemen", "belt"],
  pumpa: ["pumpa", "čerpadlo", "cerpadlo", "pump"],
  loziska: ["ložisk", "lozisk", "lager", "bearing"],
  zaml: ["zámek", "zamek", "schloss", "lock"],
  klika: ["klika", "rukojeť", "rukojet", "handle", "griff"],
  kabel: ["kabel", "vodič", "vodic", "cable", "wire"],
  sklo: ["sklo", "glass", "scheibe"],
};

function normalize(s: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function categoriesOf(text: string | null): Set<string> {
  const t = normalize(text);
  const found = new Set<string>();
  if (!t) return found;
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of kws) {
      if (t.includes(normalize(kw))) {
        found.add(cat);
        break;
      }
    }
  }
  return found;
}

function tokenOverlap(a: string | null, b: string | null): number {
  const ta = new Set(normalize(a).split(/\W+/).filter((w) => w.length >= 4));
  const tb = new Set(normalize(b).split(/\W+/).filter((w) => w.length >= 4));
  if (ta.size === 0 || tb.size === 0) return 1; // nelze posoudit → nepovažuj za chybu
  let inter = 0;
  ta.forEach((w) => {
    if (tb.has(w)) inter++;
  });
  return inter / Math.min(ta.size, tb.size);
}

function analyze(p: Part): { conflict: ConflictType; reason: string } {
  const name = p.name?.trim() || "";
  const desc = p.description?.trim() || "";
  if (!name || !desc) return { conflict: null, reason: "" };

  const cN = categoriesOf(name);
  const cD = categoriesOf(desc);

  // Záměna: obě strany mají kategorii a jsou ROZDÍLNÉ (žádný průnik)
  if (cN.size > 0 && cD.size > 0) {
    let intersects = false;
    cN.forEach((c) => {
      if (cD.has(c)) intersects = true;
    });
    if (!intersects) {
      const nCat = [...cN].join(", ");
      const dCat = [...cD].join(", ");
      return {
        conflict: "swap",
        reason: `Název odkazuje na "${nCat}", popis na "${dCat}".`,
      };
    }
    // Nepřesnost: kategorie se kryjí, ale popis přidává rozdílnou specifikaci
    if (cD.size > cN.size) {
      const extra = [...cD].filter((c) => !cN.has(c));
      if (extra.length) {
        return {
          conflict: "imprecise",
          reason: `Popis přidává odlišný komponent: "${extra.join(", ")}".`,
        };
      }
    }
  }

  // Nesoulad: žádný překryv významných tokenů a alespoň jedna strana má rozpoznanou kategorii
  const overlap = tokenOverlap(name, desc);
  if (overlap < 0.15 && (cN.size > 0 || cD.size > 0)) {
    return {
      conflict: "mismatch",
      reason: "Název a popis nemají žádné společné významné slovo.",
    };
  }

  return { conflict: null, reason: "" };
}

const TYPE_META: Record<Exclude<ConflictType, null>, { label: string; cls: string }> = {
  swap: { label: "Záměna", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  mismatch: { label: "Nesoulad", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  imprecise: { label: "Nepřesnost", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

const PAGE_SIZE = 100;

const AdminDataFixer = () => {
  const [rows, setRows] = useState<Part[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [page, setPage] = useState(0);
  const [edits, setEdits] = useState<Record<string, { name?: string; description?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // Stáhni vše (max 10k) – rozdělené po 1000 kvůli supabase limitu
      const all: Part[] = [];
      for (let from = 0; from < 10000; from += 1000) {
        const { data, error } = await supabase
          .from("parts_new")
          .select("id,oem_number,name,description,manufacturer,catalog_source")
          .order("oem_number", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Part[]));
        if (data.length < 1000) break;
      }
      setRows(all);
      toast({ title: "Načteno", description: `${all.length} dílů` });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const analyzed: Analyzed[] = useMemo(
    () => rows.map((p) => ({ ...p, ...analyze(p) })),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = normalize(search);
    return analyzed.filter((p) => {
      if (onlyConflicts && !p.conflict) return false;
      if (!q) return true;
      return (
        normalize(p.oem_number).includes(q) ||
        normalize(p.name).includes(q) ||
        normalize(p.description).includes(q)
      );
    });
  }, [analyzed, search, onlyConflicts]);

  const stats = useMemo(() => {
    const total = analyzed.length;
    const swap = analyzed.filter((p) => p.conflict === "swap").length;
    const mismatch = analyzed.filter((p) => p.conflict === "mismatch").length;
    const imprecise = analyzed.filter((p) => p.conflict === "imprecise").length;
    return { total, swap, mismatch, imprecise, ok: total - swap - mismatch - imprecise };
  }, [analyzed]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [search, onlyConflicts]);

  const setEdit = (id: string, field: "name" | "description", value: string) => {
    setEdits((e) => ({ ...e, [id]: { ...e[id], [field]: value } }));
  };

  const save = async (id: string) => {
    const patch = edits[id];
    if (!patch) return;
    setSavingId(id);
    try {
      const { error } = await supabase
        .from("parts_new")
        .update({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          last_name_check_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      setRows((r) =>
        r.map((p) =>
          p.id === id
            ? {
                ...p,
                name: patch.name ?? p.name,
                description: patch.description ?? p.description,
              }
            : p,
        ),
      );
      setEdits((e) => {
        const { [id]: _, ...rest } = e;
        return rest;
      });
      toast({ title: "Uloženo" });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const exportCSV = () => {
    const header = ["OEM", "Název", "Popis", "Výrobce", "Zdroj", "Konflikt"];
    const escape = (v: string | null) => {
      const s = (v ?? "").replace(/"/g, '""');
      return /[;"\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [header.join(";")];
    for (const p of filtered) {
      lines.push(
        [
          p.oem_number,
          p.name,
          p.description,
          p.manufacturer,
          p.catalog_source,
          p.conflict ? TYPE_META[p.conflict].label : "OK",
        ]
          .map(escape)
          .join(";"),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `katalog-cisteny-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatTile label="Celkem" value={stats.total} icon={<Filter className="w-3.5 h-3.5" />} />
        <StatTile label="OK" value={stats.ok} cls="text-emerald-300" icon={<CheckCircle2 className="w-3.5 h-3.5" />} />
        <StatTile label="Záměna" value={stats.swap} cls="text-red-300" icon={<ShieldAlert className="w-3.5 h-3.5" />} />
        <StatTile label="Nesoulad" value={stats.mismatch} cls="text-orange-300" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
        <StatTile label="Nepřesnost" value={stats.imprecise} cls="text-amber-300" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" /> Data Fixer — názvy & popisy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Hledat OEM / název / popis…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-9 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant={onlyConflicts ? "default" : "outline"}
              onClick={() => setOnlyConflicts((v) => !v)}
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Validation Mode
            </Button>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1", loading && "animate-spin")} />
              Načíst
            </Button>
            <Button size="sm" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-1" /> Export CSV ({filtered.length})
            </Button>
          </div>

          <div className="rounded border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5 w-10">#</th>
                  <th className="text-left px-2 py-1.5 w-32">OEM</th>
                  <th className="text-left px-2 py-1.5">Název</th>
                  <th className="text-left px-2 py-1.5">Popis</th>
                  <th className="text-left px-2 py-1.5 w-40">Stav</th>
                  <th className="text-left px-2 py-1.5 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const edit = edits[p.id];
                  const dirty = !!edit && (edit.name !== undefined || edit.description !== undefined);
                  const meta = p.conflict ? TYPE_META[p.conflict] : null;
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-t align-top",
                        p.conflict ? "bg-red-500/5" : "hover:bg-muted/20",
                      )}
                    >
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {meta ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-amber-300">{p.oem_number}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={edit?.name ?? p.name ?? ""}
                          onChange={(e) => setEdit(p.id, "name", e.target.value)}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Textarea
                          value={edit?.description ?? p.description ?? ""}
                          onChange={(e) => setEdit(p.id, "description", e.target.value)}
                          className="text-xs min-h-[28px] py-1"
                          rows={2}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {meta ? (
                          <div className="space-y-1">
                            <Badge variant="outline" className={meta.cls}>
                              {meta.label}
                            </Badge>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              {p.reason}
                            </p>
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                            OK
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          size="sm"
                          disabled={!dirty || savingId === p.id}
                          onClick={() => save(p.id)}
                          className="h-7 text-xs px-2"
                        >
                          {savingId === p.id ? "…" : "Uložit"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      {loading ? "Načítám…" : "Žádné záznamy."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Strana {page + 1} / {pageCount} · {filtered.length} záznamů
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  ‹ Zpět
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Další ›
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatTile = ({
  label,
  value,
  cls,
  icon,
}: {
  label: string;
  value: number;
  cls?: string;
  icon: React.ReactNode;
}) => (
  <div className="rounded border bg-card/50 px-3 py-2">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {icon}
      {label}
    </div>
    <div className={cn("text-lg font-semibold tabular-nums", cls)}>{value.toLocaleString("cs")}</div>
  </div>
);

export default AdminDataFixer;
