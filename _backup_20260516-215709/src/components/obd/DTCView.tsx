import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, RefreshCw, Wrench, Zap, ChevronRight, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useDTC } from '@/hooks/obd/use-dtc';
import { useVehicle } from '@/hooks/obd/use-vehicle';
import { CHRYSLER_DATABASE } from '@/lib/obd/chrysler-database';
import { t } from '@/lib/obd/i18n';
import type { DTCCode, DTCSeverity } from '@/lib/obd/dtc-engine';

const SEVERITY_STYLES: Record<DTCSeverity, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: 'bg-destructive/15', text: 'text-destructive', border: 'border-destructive/40', label: t.dtc.critical.toUpperCase() },
  high: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30', label: t.dtc.high.toUpperCase() },
  medium: { bg: 'bg-chart-4/10', text: 'text-chart-4', border: 'border-chart-4/30', label: t.dtc.medium.toUpperCase() },
  low: { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border', label: t.dtc.low.toUpperCase() },
};

const SYSTEM_COLORS: Record<string, string> = {
  powertrain: 'bg-destructive/20 text-destructive',
  body: 'bg-primary/20 text-primary',
  chassis: 'bg-chart-4/20 text-chart-4',
  network: 'bg-chart-3/20 text-chart-3',
};

const SYSTEM_LABELS: Record<string, string> = {
  powertrain: t.dtc.powertrain,
  body: t.dtc.body,
  chassis: t.dtc.chassis,
  network: t.dtc.network,
};

type SeverityFilter = DTCSeverity | 'all';
type SystemFilter = 'powertrain' | 'body' | 'chassis' | 'network' | 'all';

export function DTCView({ elmReady }: { elmReady: boolean }) {
  const { activeCodes, scanning, clearing, lastScan, scan, clear, getSuggestions } = useDTC();
  const { vehicle } = useVehicle();

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [systemFilter, setSystemFilter] = useState<SystemFilter>('all');
  const [showDatabase, setShowDatabase] = useState(false);

  // Filter database DTCs by vehicle model & year
  const vehicleDTCs = useMemo(() => {
    return CHRYSLER_DATABASE.dtcCodes.filter(d => {
      const modelMatch = d.affectsModels.includes(vehicle.model) || d.affectsModels.includes('both' as any);
      const yearMatch = vehicle.year >= d.yearRange[0] && vehicle.year <= d.yearRange[1];
      return modelMatch && yearMatch;
    });
  }, [vehicle]);

  // Full-text search + filters on active codes
  const filteredActive = useMemo(() => {
    let codes = activeCodes;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      codes = codes.filter(c =>
        c.code.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.possibleCause.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== 'all') codes = codes.filter(c => c.severity === severityFilter);
    if (systemFilter !== 'all') codes = codes.filter(c => c.system === systemFilter);
    return codes.sort((a, b) => {
      const order: DTCSeverity[] = ['critical', 'high', 'medium', 'low'];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    });
  }, [activeCodes, searchQuery, severityFilter, systemFilter]);

  // Full-text search + filters on database
  const filteredDatabase = useMemo(() => {
    let codes = vehicleDTCs;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      codes = codes.filter(c =>
        c.code.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.possibleCause.toLowerCase().includes(q) ||
        c.recommendedAction.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== 'all') codes = codes.filter(c => c.severity === severityFilter);
    if (systemFilter !== 'all') codes = codes.filter(c => c.system === systemFilter);
    return codes;
  }, [vehicleDTCs, searchQuery, severityFilter, systemFilter]);

  const criticalCount = activeCodes.filter(c => c.severity === 'critical' || c.severity === 'high').length;
  const suggestions = getSuggestions();

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            {t.dtc.title}
          </h2>
          <p className="text-[10px] text-muted-foreground">
            {vehicle.label} • {activeCodes.length > 0 ? `${activeCodes.length} ${t.dtc.codes}` : t.dtc.noCodesFound}
            {criticalCount > 0 && <span className="text-destructive ml-1">• {criticalCount} {t.dtc.criticalLabel}</span>}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="default" onClick={scan} disabled={scanning} className="h-7 text-xs">
            <RefreshCw className={`w-3 h-3 mr-1 ${scanning ? 'animate-spin' : ''}`} />
            {t.dtc.scan}
          </Button>
          <Button size="sm" variant="outline" onClick={clear} disabled={clearing || activeCodes.length === 0} className="h-7 text-xs">
            <Trash2 className="w-3 h-3 mr-1" />
            {t.dtc.clear}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder={t.dtc.searchPlaceholder}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="h-8 pl-8 text-xs bg-card"
        />
      </div>

      {/* Filters */}
      <div className="space-y-1.5">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {(['all', 'critical', 'high', 'medium', 'low'] as SeverityFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-2 py-1 rounded-full text-[9px] font-medium whitespace-nowrap transition-colors ${
                severityFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              {s === 'all' ? t.dtc.all : s === 'critical' ? t.dtc.critical : s === 'high' ? t.dtc.high : s === 'medium' ? t.dtc.medium : t.dtc.low}
            </button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {(['all', 'powertrain', 'body', 'chassis', 'network'] as SystemFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setSystemFilter(s)}
              className={`px-2 py-1 rounded-full text-[9px] font-medium whitespace-nowrap transition-colors ${
                systemFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              {s === 'all' ? t.dtc.all : SYSTEM_LABELS[s] || s}
            </button>
          ))}
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => setShowDatabase(false)}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
            !showDatabase ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'
          }`}
        >
          {t.dtc.active} ({filteredActive.length})
        </button>
        <button
          onClick={() => setShowDatabase(true)}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
            showDatabase ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'
          }`}
        >
          {t.dtc.database} ({filteredDatabase.length})
        </button>
      </div>

      {/* Summary Cards */}
      {!showDatabase && activeCodes.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {(['powertrain', 'body', 'chassis', 'network'] as const).map(sys => {
            const count = activeCodes.filter(c => c.system === sys).length;
            return (
              <div key={sys} className={`rounded-lg p-2 text-center ${count > 0 ? SYSTEM_COLORS[sys] : 'bg-muted/30 text-muted-foreground'}`}>
                <div className="text-lg font-bold">{count}</div>
                <div className="text-[8px] uppercase">{sys[0]}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Code List */}
      {!showDatabase && (
        <div className="space-y-2">
          <AnimatePresence>
            {filteredActive.map((dtc, i) => {
              const style = SEVERITY_STYLES[dtc.severity];
              return (
                <motion.div
                  key={dtc.code}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`${style.bg} ${style.border} border rounded-lg p-2.5`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-foreground">{dtc.code}</span>
                      <Badge variant="outline" className={`text-[8px] ${style.text}`}>{style.label}</Badge>
                      {dtc.isPending && <Badge variant="secondary" className="text-[8px]">{t.dtc.pending}</Badge>}
                    </div>
                    {dtc.severity === 'critical' && (
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      </motion.div>
                    )}
                  </div>
                  <p className="text-[11px] text-foreground mb-1">{dtc.description}</p>
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                    <Zap className="w-3 h-3" />
                    {dtc.possibleCause}
                  </div>
                  {dtc.relatedSignals.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {dtc.relatedSignals.map(s => (
                        <span key={s} className="text-[8px] bg-background/50 rounded px-1.5 py-0.5 text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between text-[8px] text-muted-foreground mt-1.5">
                    <span>×{dtc.occurenceCount}</span>
                    <span>{new Date(dtc.lastSeen).toLocaleString()}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredActive.length === 0 && !scanning && (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-xs text-muted-foreground">
                {searchQuery ? t.dtc.noCodesMatching : t.dtc.noCodesFound}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {lastScan ? `${t.dtc.lastScan}: ${new Date(lastScan).toLocaleTimeString()}` : t.dtc.tapToScan}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Database View */}
      {showDatabase && (
        <div className="space-y-2">
          {filteredDatabase.map((dtc, i) => {
            const style = SEVERITY_STYLES[dtc.severity];
            return (
              <motion.div
                key={`${dtc.code}-${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className={`${style.bg} ${style.border} border rounded-lg p-2.5`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-foreground">{dtc.code}</span>
                    <Badge variant="outline" className={`text-[8px] ${style.text}`}>{style.label}</Badge>
                    <Badge variant="secondary" className="text-[8px]">{dtc.system}</Badge>
                  </div>
                </div>
                <p className="text-[11px] text-foreground mb-1">{dtc.description}</p>
                <p className="text-[9px] text-muted-foreground mb-1">
                  <strong>{t.dtc.cause}:</strong> {dtc.possibleCause}
                </p>
                <p className="text-[9px] text-primary">
                  <strong>{t.dtc.action}:</strong> {dtc.recommendedAction}
                </p>
                {dtc.commonInMileage && (
                  <p className="text-[8px] text-chart-4 mt-1">{t.dtc.commonAt} {dtc.commonInMileage}</p>
                )}
                {dtc.relatedSensors.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {dtc.relatedSensors.map(s => (
                      <span key={s} className="text-[8px] bg-background/50 rounded px-1.5 py-0.5 text-muted-foreground">{s}</span>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
          {filteredDatabase.length === 0 && (
            <div className="text-center py-10">
              <p className="text-xs text-muted-foreground">{t.dtc.noMatchingFilters} {vehicle.label}</p>
            </div>
          )}
        </div>
      )}

      {scanning && (
        <div className="text-center py-10">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="inline-block"
          >
            <RefreshCw className="w-8 h-8 text-primary" />
          </motion.div>
          <p className="text-xs text-muted-foreground mt-2">{t.dtc.scanningForDtc}</p>
        </div>
      )}

      {/* Suggestions */}
      {!showDatabase && suggestions.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-[10px] font-medium text-muted-foreground">{t.dtc.suggestions}</h3>
          {suggestions.map(s => (
            <div key={s.code} className="flex items-center gap-2 bg-card rounded border border-border p-2">
              <ChevronRight className="w-3 h-3 text-primary shrink-0" />
              <div>
                <span className="text-[10px] font-mono text-foreground">{s.code}:</span>
                <span className="text-[10px] text-muted-foreground ml-1">{s.suggestion}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
