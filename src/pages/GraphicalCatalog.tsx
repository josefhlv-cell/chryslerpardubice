import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ArrowLeft, Car, Layers, Search, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Position = { pos: number; oem: string; name: string; x: number; y: number; qty: number };
type Section = { id: string; name: string; name_en: string; icon: string; positions: Position[] };
type Catalog = {
  vehicle: { brand: string; model: string; year: number; engine: string; yq_code: string; source_url: string };
  fetched_at: string;
  note: string;
  sections: Section[];
};

export default function GraphicalCatalog() {
  const navigate = useNavigate();
  const { user, isAdmin, isLoading } = useAuth();
  const [data, setData] = useState<Catalog | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activePos, setActivePos] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [schemaUrl, setSchemaUrl] = useState<string | null>(null);
  const [fetchingSchema, setFetchingSchema] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) navigate("/auth");
  }, [isLoading, user, isAdmin, navigate]);

  useEffect(() => {
    fetch("/jm_graphical_catalog.json")
      .then((r) => r.json())
      .then((d: Catalog) => {
        setData(d);
      })
      .catch(console.error);
  }, []);

  const filteredSections = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) return data.sections;
    const q = query.toLowerCase();
    return data.sections.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.name_en.toLowerCase().includes(q) ||
        s.positions.some((p) => p.oem.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)),
    );
  }, [data, query]);

  const activeSection = useMemo(
    () => data?.sections.find((s) => s.id === activeId) ?? null,
    [data, activeId],
  );

  const activeIdx = useMemo(
    () => (activeSection && data ? data.sections.findIndex((s) => s.id === activeSection.id) : -1),
    [activeSection, data],
  );

  const goPrev = () => {
    if (!data || activeIdx <= 0) return;
    setActiveId(data.sections[activeIdx - 1].id);
    setActivePos(null);
  };
  const goNext = () => {
    if (!data || activeIdx < 0 || activeIdx >= data.sections.length - 1) return;
    setActiveId(data.sections[activeIdx + 1].id);
    setActivePos(null);
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Načítání grafického katalogu…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          {activeSection ? (
            <Button variant="ghost" size="sm" onClick={() => { setActiveId(null); setActivePos(null); }}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Sekce
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Zpět
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-base md:text-lg font-bold truncate flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Grafický katalog
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {data.vehicle.brand} {data.vehicle.model} • {data.vehicle.year} • {data.vehicle.engine}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {!activeSection ? (
          <>
            {/* Vehicle banner */}
            <Card className="p-5 mb-6 bg-gradient-to-br from-primary/10 via-background to-background border-primary/20">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Car className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Vybraný vůz</div>
                  <div className="text-lg md:text-xl font-bold">
                    {data.vehicle.brand} {data.vehicle.model} {data.vehicle.year}
                  </div>
                  <div className="text-sm text-muted-foreground">{data.vehicle.engine}</div>
                </div>
              </div>
            </Card>

            {/* Search */}
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Hledat sekci, díl nebo OEM číslo…"
                className="pl-9"
              />
            </div>

            {/* Section grid */}
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Sekce ({filteredSections.length})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredSections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setActiveId(s.id); setActivePos(null); }}
                  className="text-left group"
                >
                  <Card className="p-4 h-full hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all">
                    <SectionThumbnail section={s} />
                    <div className="mt-3">
                      <div className="font-semibold text-sm group-hover:text-primary transition-colors">
                        {s.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                        {s.name_en}
                      </div>
                      <Badge variant="secondary" className="mt-2 text-xs">
                        {s.positions.length} pozic
                      </Badge>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          </>
        ) : (
          <SectionDetail
            section={activeSection}
            activePos={activePos}
            setActivePos={setActivePos}
            onPrev={goPrev}
            onNext={goNext}
            hasPrev={activeIdx > 0}
            hasNext={activeIdx < data.sections.length - 1}
            navigate={navigate}
          />
        )}
      </div>
    </div>
  );
}

function SectionThumbnail({ section }: { section: Section }) {
  return (
    <div className="aspect-square rounded-lg bg-gradient-to-br from-muted/40 to-muted/10 border border-border/50 relative overflow-hidden">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <rect x="20" y="20" width="60" height="60" rx="4" fill="none" stroke="hsl(var(--primary)/0.3)" strokeWidth="0.5" strokeDasharray="2 2" />
        {section.positions.slice(0, 6).map((p) => (
          <circle key={p.pos} cx={p.x} cy={p.y} r="3" fill="hsl(var(--primary)/0.6)" />
        ))}
      </svg>
    </div>
  );
}

function SectionDetail({
  section, activePos, setActivePos, onPrev, onNext, hasPrev, hasNext, navigate,
}: {
  section: Section;
  activePos: number | null;
  setActivePos: (n: number | null) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  navigate: (path: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={!hasPrev}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Předchozí
        </Button>
        <div className="text-center">
          <h2 className="font-bold text-lg">{section.name}</h2>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{section.name_en}</div>
        </div>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNext}>
          Další <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Schema */}
      <Card className="p-4 mb-4 bg-card">
        <div className="aspect-[4/3] md:aspect-[16/9] rounded-lg bg-gradient-to-br from-muted/40 to-muted/10 border border-border relative overflow-hidden">
          <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
            {/* schematic outline */}
            <rect x="10" y="10" width="80" height="80" rx="3" fill="none" stroke="hsl(var(--border))" strokeWidth="0.3" strokeDasharray="1 1" />
            <line x1="50" y1="10" x2="50" y2="90" stroke="hsl(var(--border))" strokeWidth="0.2" strokeDasharray="1 2" />
            {/* positions */}
            {section.positions.map((p) => {
              const isActive = activePos === p.pos;
              return (
                <g key={p.pos} onClick={() => setActivePos(p.pos)} style={{ cursor: "pointer" }}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isActive ? 4 : 3}
                    fill={isActive ? "hsl(var(--primary))" : "hsl(var(--primary)/0.25)"}
                    stroke={isActive ? "hsl(var(--primary))" : "hsl(var(--primary)/0.5)"}
                    strokeWidth="0.5"
                    className="transition-all"
                  />
                  <text
                    x={p.x}
                    y={p.y + 1.3}
                    textAnchor="middle"
                    fontSize="3"
                    fontWeight="bold"
                    fill={isActive ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))"}
                    style={{ pointerEvents: "none" }}
                  >
                    {p.pos}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </Card>

      {/* Parts list */}
      <div className="space-y-2">
        {section.positions.map((p) => {
          const isActive = activePos === p.pos;
          return (
            <Card
              key={p.pos}
              className={`p-3 cursor-pointer transition-all ${
                isActive ? "border-primary bg-primary/5 shadow-md shadow-primary/10" : "hover:border-primary/40"
              }`}
              onClick={() => setActivePos(p.pos)}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {p.pos}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/catalog?search=${encodeURIComponent(p.oem)}`);
                    }}
                    className="text-xs font-mono text-primary hover:underline"
                  >
                    {p.oem}
                  </button>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {p.qty}×
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
