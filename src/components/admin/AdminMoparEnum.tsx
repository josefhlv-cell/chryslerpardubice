import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Search, AlertTriangle, CheckCircle, Loader2, Database } from "lucide-react";

type EnumRun = {
  id: string;
  batch_id: string;
  mode: string;
  total_candidates: number;
  processed: number;
  found: number;
  not_found: number;
  errors: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  last_error: string | null;
};

type StagingRow = {
  oem_number: string;
  catalog_name: string | null;
  price_with_vat: number;
  exists_in_parts_new: boolean;
  found_at: string;
};

const PROFILES = [
  { id: 'test',         label: 'Test (1 hod)',          desc: '~5 000 dotazů, 2 req/s. Bezpečné ověření.' },
  { id: 'conservative', label: 'Konzervativně (5-7 dní)', desc: '~170 k dotazů, 2 req/s. Minimální riziko banu.' },
  { id: 'medium',       label: 'Středně (3-4 dny)',     desc: '~430 k dotazů, 5 req/s. Nízké riziko.' },
  { id: 'aggressive',   label: 'Agresivně (1-2 dny)',   desc: '~860 k dotazů, 10 req/s. Vyšší riziko banu.' },
];

const AdminMoparEnum = () => {
  const [starting, setStarting] = useState(false);
  const [runs, setRuns] = useState<EnumRun[]>([]);
  const [staging, setStaging] = useState<StagingRow[]>([]);
  const [stagingCount, setStagingCount] = useState(0);

  const refresh = async () => {
    const [{ data: r }, { data: s, count }] = await Promise.all([
      supabase.from('mopar_enum_runs').select('*').order('started_at', { ascending: false }).limit(10),
      supabase.from('mopar_price_staging').select('oem_number,catalog_name,price_with_vat,exists_in_parts_new,found_at', { count: 'exact' }).order('found_at', { ascending: false }).limit(20),
    ]);
    setRuns((r as EnumRun[]) || []);
    setStaging((s as StagingRow[]) || []);
    setStagingCount(count || 0);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, []);

  const startEnum = async (mode: string) => {
    if (mode !== 'test' && !confirm(`Spustit režim "${mode}"? Tato akce může trvat několik dní a obsadí Edge runtime. Pokračovat?`)) return;
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('mopar-bruteforce-enum', { body: { mode } });
      if (error) throw error;
      toast({
        title: '✅ Spuštěno',
        description: `Batch ${data.batch_id} | ${data.total_candidates} kandidátů | odhad ${data.estimated_minutes} min`,
      });
      await refresh();
    } catch (e: any) {
      toast({ title: '❌ Chyba', description: String(e.message || e), variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const importToParts = async (oem: string) => {
    const row = staging.find(s => s.oem_number === oem);
    if (!row) return;
    try {
      const { error } = await supabase.from('parts_new').insert({
        oem_number: row.oem_number,
        name: row.catalog_name || `Mopar díl ${row.oem_number}`,
        price_with_vat: row.price_with_vat,
        price_without_vat: Math.round(row.price_with_vat / 1.21 * 100) / 100,
        catalog_source: 'mopar',
        availability: 'available',
      });
      if (error) throw error;
      await supabase.from('mopar_price_staging').update({
        status: 'imported',
        imported_at: new Date().toISOString(),
        exists_in_parts_new: true,
      }).eq('oem_number', oem);
      toast({ title: '✅ Naimportováno', description: oem });
      refresh();
    } catch (e: any) {
      toast({ title: '❌ Chyba', description: String(e.message || e), variant: 'destructive' });
    }
  };

  const activeRun = runs.find(r => r.status === 'running');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Brute-force OEM enumerace (vernostsevyplaci.cz)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/40 border border-border rounded-md p-3 text-sm space-y-1">
            <p>🔍 Hledá nové Mopar OEM v <b>numerických sousedech</b> existujících dílů (např. 68229000 → testuje 68228995..68229005).</p>
            <p>📦 Nálezy se ukládají do staging tabulky — <b>nic se neimportuje automaticky</b> do katalogu.</p>
            <p>⚠️ Doporučuju začít <b>Test režimem</b> (1 hod), výsledky ověřit a teprve pak rozhodnout o full scanu.</p>
          </div>

          {activeRun && (
            <div className="bg-primary/10 border border-primary/30 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Běží: {activeRun.batch_id}
                </span>
                <Badge variant="outline">{activeRun.mode}</Badge>
              </div>
              <Progress value={activeRun.total_candidates > 0 ? (activeRun.processed / activeRun.total_candidates) * 100 : 0} />
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>📊 {activeRun.processed.toLocaleString()} / {activeRun.total_candidates.toLocaleString()}</div>
                <div className="text-emerald-500">✅ {activeRun.found} nalezeno</div>
                <div className="text-muted-foreground">⊘ {activeRun.not_found}</div>
                <div className="text-destructive">❌ {activeRun.errors}</div>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {PROFILES.map(p => (
              <Button
                key={p.id}
                variant={p.id === 'test' ? 'default' : 'outline'}
                disabled={starting || !!activeRun}
                onClick={() => startEnum(p.id)}
                className="h-auto flex-col items-start p-3 gap-1"
              >
                <span className="font-semibold">{p.label}</span>
                <span className="text-xs opacity-80 font-normal text-left">{p.desc}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Staging — nalezené ceny ({stagingCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {staging.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím žádné nálezy. Spusť Test režim výše.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {staging.map(row => (
                <div key={row.oem_number} className="flex items-center justify-between p-2 border border-border rounded text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-semibold">{row.oem_number}</div>
                    <div className="text-xs text-muted-foreground truncate">{row.catalog_name || '—'}</div>
                  </div>
                  <div className="text-right ml-3">
                    <div className="font-semibold">{row.price_with_vat?.toLocaleString('cs-CZ')} Kč</div>
                    {row.exists_in_parts_new ? (
                      <Badge variant="secondary" className="text-xs"><CheckCircle className="h-3 w-3 mr-1" />V katalogu</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => importToParts(row.oem_number)} className="h-6 text-xs mt-1">
                        Importovat
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historie běhů</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-xs font-mono">
            {runs.map(r => (
              <div key={r.id} className="flex items-center justify-between py-1 border-b border-border/50">
                <span>{r.batch_id}</span>
                <span className="flex gap-2">
                  <Badge variant={r.status === 'completed' ? 'default' : r.status === 'running' ? 'secondary' : 'destructive'}>
                    {r.status}
                  </Badge>
                  <span>{r.found}/{r.processed}</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMoparEnum;
