import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2, Package, CheckCircle, XCircle, Layers } from "lucide-react";

const BRANDS = ["Chrysler", "Dodge", "Jeep", "RAM"];

const MODELS: Record<string, string[]> = {
  Chrysler: ["300C", "300", "Pacifica", "Town & Country", "Voyager"],
  Dodge: ["Grand Caravan", "Durango", "Charger", "Challenger", "Journey", "Nitro"],
  Jeep: ["Grand Cherokee", "Wrangler", "Cherokee", "Compass", "Renegade"],
  RAM: ["1500", "2500", "3500"],
};

interface GenerateResult {
  success: boolean;
  parts_generated?: number;
  parts_saved?: number;
  categories?: string[];
  error?: string;
}

interface BatchItem {
  brand: string;
  model: string;
  status: "pending" | "running" | "done" | "error";
  result?: GenerateResult;
}

const AICatalogImport = () => {
  // Single mode
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [year, setYear] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  // Batch mode
  const [batchMode, setBatchMode] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Record<string, boolean>>({});
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  const effectiveModel = customModel || model;

  const allModels = BRANDS.flatMap(b => (MODELS[b] || []).map(m => ({ brand: b, model: m, key: `${b}|${m}` })));

  const selectedCount = Object.values(selectedModels).filter(Boolean).length;

  const toggleModel = (key: string) => {
    setSelectedModels(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllBrand = (b: string) => {
    const models = MODELS[b] || [];
    const allSelected = models.every(m => selectedModels[`${b}|${m}`]);
    const next = { ...selectedModels };
    models.forEach(m => { next[`${b}|${m}`] = !allSelected; });
    setSelectedModels(next);
  };

  const selectAll = () => {
    const allSelected = allModels.every(m => selectedModels[m.key]);
    const next: Record<string, boolean> = {};
    allModels.forEach(m => { next[m.key] = !allSelected; });
    setSelectedModels(next);
  };

  const generateSingle = useCallback(async (b: string, m: string, y?: number): Promise<GenerateResult> => {
    try {
      const { data, error } = await supabase.functions.invoke("scrape-7zap", {
        body: { brand: b, model: m, year: y, action: "generate-catalog" },
      });
      if (error) throw error;
      return data as GenerateResult;
    } catch (err: any) {
      return { success: false, error: err?.message || "Chyba" };
    }
  }, []);

  const handleGenerate = async () => {
    if (!brand || !effectiveModel) {
      toast({ title: "Vyplňte značku a model", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setResult(null);
    const res = await generateSingle(brand, effectiveModel, year ? parseInt(year) : undefined);
    setResult(res);
    if (res.success) {
      toast({ title: "Import dokončen", description: `${res.parts_saved || res.parts_generated} dílů pro ${brand} ${effectiveModel}` });
    } else {
      toast({ title: "Chyba generování", description: res.error || "Neznámá chyba", variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleBatchGenerate = async () => {
    const items: BatchItem[] = allModels
      .filter(m => selectedModels[m.key])
      .map(m => ({ brand: m.brand, model: m.model, status: "pending" as const }));

    if (items.length === 0) {
      toast({ title: "Vyberte alespoň 1 model", variant: "destructive" });
      return;
    }

    setBatchItems(items);
    setBatchRunning(true);
    setBatchProgress(0);

    let done = 0;
    for (let i = 0; i < items.length; i++) {
      setBatchItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: "running" } : it));

      const res = await generateSingle(items[i].brand, items[i].model);

      setBatchItems(prev => prev.map((it, idx) =>
        idx === i ? { ...it, status: res.success ? "done" : "error", result: res } : it
      ));

      done++;
      setBatchProgress(Math.round((done / items.length) * 100));
    }

    const successful = items.length; // will be updated via state
    setBatchRunning(false);
    toast({ title: "Batch import dokončen", description: `${done} modelů zpracováno` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-primary" />
          AI generování katalogu dílů
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          AI vygeneruje 60–80 reálných Mopar OEM dílů napříč 10 kategoriemi a uloží je do databáze.
        </p>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={!batchMode ? "default" : "outline"}
            onClick={() => setBatchMode(false)}
            className="text-xs"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Jeden model
          </Button>
          <Button
            size="sm"
            variant={batchMode ? "default" : "outline"}
            onClick={() => setBatchMode(true)}
            className="text-xs"
          >
            <Layers className="w-3 h-3 mr-1" />
            Hromadný import
          </Button>
        </div>

        {!batchMode ? (
          <>
            {/* Single model UI */}
            <div className="grid grid-cols-2 gap-2">
              <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); setCustomModel(""); }}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Značka" />
                </SelectTrigger>
                <SelectContent>
                  {BRANDS.map(b => (
                    <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={model} onValueChange={(v) => { setModel(v); setCustomModel(""); }} disabled={!brand}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  {(MODELS[brand] || []).map(m => (
                    <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Vlastní model (volitelné)"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                className="text-xs h-9"
              />
              <Input
                placeholder="Rok (volitelné)"
                type="number"
                min={1990}
                max={2026}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating || !brand || !effectiveModel}
              className="w-full"
            >
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {generating ? "Generuji katalog…" : `Generovat katalog pro ${brand} ${effectiveModel || "…"}`}
            </Button>

            {generating && (
              <p className="text-[10px] text-muted-foreground text-center animate-pulse">
                AI generuje OEM díly a kategorie. Může trvat 15–30 sekund…
              </p>
            )}

            {result && <ResultCard result={result} />}
          </>
        ) : (
          <>
            {/* Batch mode UI */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Vyberte modely ({selectedCount} vybráno)</p>
                <Button size="sm" variant="ghost" onClick={selectAll} className="text-[10px] h-6 px-2">
                  {allModels.every(m => selectedModels[m.key]) ? "Odznačit vše" : "Vybrat vše"}
                </Button>
              </div>

              <div className="space-y-2 max-h-64 overflow-auto rounded-lg border p-2">
                {BRANDS.map(b => {
                  const models = MODELS[b] || [];
                  const allChecked = models.every(m => selectedModels[`${b}|${m}`]);
                  const someChecked = models.some(m => selectedModels[`${b}|${m}`]);

                  return (
                    <div key={b} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={allChecked ? true : someChecked ? "indeterminate" : false}
                          onCheckedChange={() => selectAllBrand(b)}
                          id={`brand-${b}`}
                        />
                        <label htmlFor={`brand-${b}`} className="text-xs font-semibold cursor-pointer">{b}</label>
                      </div>
                      <div className="ml-6 grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {models.map(m => {
                          const key = `${b}|${m}`;
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <Checkbox
                                checked={!!selectedModels[key]}
                                onCheckedChange={() => toggleModel(key)}
                                id={`model-${key}`}
                              />
                              <label htmlFor={`model-${key}`} className="text-[11px] cursor-pointer">{m}</label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                onClick={handleBatchGenerate}
                disabled={batchRunning || selectedCount === 0}
                className="w-full"
              >
                {batchRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Layers className="w-4 h-4 mr-2" />}
                {batchRunning
                  ? `Generuji… (${batchProgress}%)`
                  : `Generovat katalog pro ${selectedCount} modelů`}
              </Button>

              {batchRunning && <Progress value={batchProgress} className="h-2" />}

              {batchItems.length > 0 && (
                <div className="max-h-48 overflow-auto text-[11px] border rounded-lg p-2 space-y-0.5 bg-background">
                  {batchItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5">
                      <span className="font-medium">{item.brand} {item.model}</span>
                      <span className="flex items-center gap-1">
                        {item.status === "pending" && <span className="text-muted-foreground">čeká</span>}
                        {item.status === "running" && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                        {item.status === "done" && (
                          <>
                            <CheckCircle className="w-3 h-3 text-green-600" />
                            <span className="text-green-600">{item.result?.parts_saved || item.result?.parts_generated} dílů</span>
                          </>
                        )}
                        {item.status === "error" && (
                          <>
                            <XCircle className="w-3 h-3 text-destructive" />
                            <span className="text-destructive truncate max-w-[120px]">{item.result?.error}</span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                  {!batchRunning && batchItems.length > 0 && (
                    <div className="border-t pt-1 mt-1 font-semibold flex justify-between">
                      <span>Celkem</span>
                      <span>
                        {batchItems.filter(i => i.status === "done").reduce((s, i) => s + (i.result?.parts_saved || i.result?.parts_generated || 0), 0)} dílů
                        {" · "}
                        {batchItems.filter(i => i.status === "done").length}/{batchItems.length} OK
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const ResultCard = ({ result }: { result: GenerateResult }) => (
  <div className={`rounded-lg border p-3 space-y-2 ${result.success ? 'border-green-300 bg-green-50 dark:bg-green-950/20' : 'border-destructive/30 bg-destructive/5'}`}>
    <div className="flex items-center gap-2 text-sm font-semibold">
      {result.success ? (
        <><CheckCircle className="w-4 h-4 text-green-600" /> Import úspěšný</>
      ) : (
        <><XCircle className="w-4 h-4 text-destructive" /> Chyba</>
      )}
    </div>
    {result.success && (
      <>
        <div className="flex gap-4 text-xs">
          <span><Package className="w-3 h-3 inline mr-1" />{result.parts_generated || result.parts_saved} dílů</span>
          <span>{result.categories?.length || 0} kategorií</span>
        </div>
        {result.categories && result.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.categories.map(c => (
              <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{c}</span>
            ))}
          </div>
        )}
      </>
    )}
    {result.error && <p className="text-xs text-destructive">{result.error}</p>}
  </div>
);

export default AICatalogImport;
