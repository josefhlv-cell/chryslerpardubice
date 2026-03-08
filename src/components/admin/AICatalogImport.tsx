import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Package, CheckCircle, XCircle } from "lucide-react";

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

const AICatalogImport = () => {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [year, setYear] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const effectiveModel = customModel || model;

  const handleGenerate = async () => {
    if (!brand || !effectiveModel) {
      toast({ title: "Vyplňte značku a model", variant: "destructive" });
      return;
    }

    setGenerating(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("scrape-7zap", {
        body: {
          brand,
          model: effectiveModel,
          year: year ? parseInt(year) : undefined,
          action: "generate-catalog",
        },
      });

      if (error) throw error;

      setResult(data as GenerateResult);

      if (data?.success) {
        toast({
          title: "Import dokončen",
          description: `${data.parts_saved || data.parts_generated} dílů pro ${brand} ${effectiveModel}`,
        });
      } else {
        toast({
          title: "Chyba generování",
          description: data?.error || "Neznámá chyba",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      const msg = err?.message || "Chyba při volání AI";
      setResult({ success: false, error: msg });
      toast({ title: "Chyba", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
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
          AI vygeneruje 60–80 reálných Mopar OEM dílů napříč 10 kategoriemi (Motor, Brzdy, Odpružení, Elektro…) a uloží je do databáze.
        </p>

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
          {generating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {generating ? "Generuji katalog…" : `Generovat katalog pro ${brand} ${effectiveModel || "…"}`}
        </Button>

        {generating && (
          <p className="text-[10px] text-muted-foreground text-center animate-pulse">
            AI generuje OEM díly a kategorie. Může trvat 15–30 sekund…
          </p>
        )}

        {result && (
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
                      <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            {result.error && (
              <p className="text-xs text-destructive">{result.error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AICatalogImport;
