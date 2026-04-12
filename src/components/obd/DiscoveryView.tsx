import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Radar, Square, Download, Trash2, ChevronDown, ChevronRight, 
  Eye, Zap, Flag, HelpCircle, Database, FileText, Cpu, Thermometer, Hash,
  CheckCircle2, AlertTriangle, Clock
} from 'lucide-react';
import { useDiscovery } from '@/hooks/obd/use-discovery';
import type { DiscoveredDID, DiscoveryProgress } from '@/lib/obd/did-discovery';

type Props = {
  elmReady: boolean;
};

type FilterTab = 'all' | 'live' | 'static' | 'flags' | 'unknown';

const FILTER_TABS: { id: FilterTab; label: string; icon: typeof Eye }[] = [
  { id: 'all', label: 'All', icon: Database },
  { id: 'live', label: 'Live', icon: Zap },
  { id: 'static', label: 'Static', icon: FileText },
  { id: 'flags', label: 'Flags', icon: Flag },
  { id: 'unknown', label: '???', icon: HelpCircle },
];

const CLASS_COLORS: Record<string, string> = {
  live: 'text-success',
  static: 'text-accent',
  flags: 'text-warning',
  unknown: 'text-destructive',
};

const CLASS_BG: Record<string, string> = {
  live: 'bg-success/10 border-success/30',
  static: 'bg-accent/10 border-accent/30',
  flags: 'bg-warning/10 border-warning/30',
  unknown: 'bg-destructive/10 border-destructive/30',
};

const CONFIDENCE_ICON: Record<string, typeof CheckCircle2> = {
  high: CheckCircle2,
  medium: AlertTriangle,
  low: HelpCircle,
};

function getConfidenceLevel(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.7) return 'high';
  if (c >= 0.4) return 'medium';
  return 'low';
}

export function DiscoveryView({ elmReady }: Props) {
  const { progress, results, stats, running, startDiscovery, abort, clear, exportJSON } = useDiscovery();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [expandedDID, setExpandedDID] = useState<number | null>(null);
  const [showDecoderMap, setShowDecoderMap] = useState(false);

  const filtered = useMemo(() => {
    if (filter === 'all') return results;
    return results.filter(d => d.classification === filter);
  }, [results, filter]);

  const counts = useMemo(() => ({
    all: results.length,
    live: results.filter(d => d.classification === 'live').length,
    static: results.filter(d => d.classification === 'static').length,
    flags: results.filter(d => d.classification === 'flags').length,
    unknown: results.filter(d => d.classification === 'unknown').length,
  }), [results]);

  const handleExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `did-discovery-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!elmReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="w-20 h-20 rounded-2xl carbon-bg border border-border flex items-center justify-center">
          <Radar className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Initialize ELM327 to run auto-discovery
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Auto Discovery</h2>
        <div className="flex gap-1">
          {results.length > 0 && (
            <>
              <button onClick={handleExport} className="p-1.5 rounded-md bg-muted active:bg-border">
                <Download className="w-3.5 h-3.5 text-accent" />
              </button>
              <button onClick={clear} className="p-1.5 rounded-md bg-muted active:bg-border">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Start / Abort Button */}
      <motion.button
        onClick={running ? abort : startDiscovery}
        className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-semibold text-sm ${
          running
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground'
        }`}
        whileTap={{ scale: 0.98 }}
      >
        {running ? (
          <>
            <Square className="w-4 h-4 fill-current" />
            <span>Abort Discovery</span>
          </>
        ) : (
          <>
            <Radar className="w-4 h-4" />
            <span>Start Full Discovery</span>
          </>
        )}
      </motion.button>

      {/* Progress */}
      {progress && (progress.phase === 'scanning' || progress.phase === 'session') && (
        <ProgressPanel progress={progress} />
      )}

      {/* Stats Summary */}
      {stats && <StatsSummary stats={stats} />}

      {/* Filter Tabs */}
      {results.length > 0 && (
        <>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-colors ${
                  filter === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
                <span className="opacity-70">({counts[tab.id]})</span>
              </button>
            ))}
          </div>

          {/* Decoder Map Toggle */}
          <button
            onClick={() => setShowDecoderMap(!showDecoderMap)}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground"
          >
            <span className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-accent" />
              Decoder Map ({results.length} entries)
            </span>
            {showDecoderMap ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {showDecoderMap && <DecoderMapView results={results} />}

          {/* Results List */}
          <div className="space-y-1 max-h-[320px] overflow-y-auto">
            <AnimatePresence>
              {filtered.map(d => (
                <DiscoveredDIDCard
                  key={d.did}
                  item={d}
                  expanded={expandedDID === d.did}
                  onToggle={() => setExpandedDID(expandedDID === d.did ? null : d.did)}
                />
              ))}
            </AnimatePresence>
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No DIDs match this filter
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProgressPanel({ progress }: { progress: DiscoveryProgress }) {
  const pct = progress.totalCount > 0 ? (progress.scannedCount / progress.totalCount) * 100 : 0;
  const remaining = progress.estimatedRemainingMs;
  const remSec = Math.ceil(remaining / 1000);

  return (
    <div className="space-y-2 p-3 rounded-xl bg-card border border-border">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-muted-foreground font-mono">{progress.currentRange}</span>
        <span className="text-[10px] font-mono text-accent">
          {progress.scannedCount}/{progress.totalCount}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">
          0x{progress.currentDID.toString(16).toUpperCase().padStart(4, '0')}
        </span>
        <div className="flex gap-3">
          <span className="text-[10px] text-success font-mono">✓ {progress.foundCount}</span>
          <span className="text-[10px] text-destructive font-mono">✗ {progress.errorCount}</span>
          <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {remSec > 60 ? `${Math.floor(remSec / 60)}m${remSec % 60}s` : `${remSec}s`}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatsSummary({ stats }: { stats: import('@/lib/did-discovery').DiscoveryStats }) {
  const durSec = (stats.durationMs / 1000).toFixed(1);
  return (
    <div className="grid grid-cols-4 gap-1.5">
      <MiniStat label="Found" value={stats.totalFound} color="text-accent" />
      <MiniStat label="Known" value={stats.knownDIDs} color="text-success" />
      <MiniStat label="Unknown" value={stats.unknownDIDs} color="text-destructive" />
      <MiniStat label="Time" value={`${durSec}s`} color="text-muted-foreground" />
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center p-2 rounded-lg bg-card border border-border">
      <span className={`font-mono text-sm font-bold ${color}`}>{value}</span>
      <span className="text-label">{label}</span>
    </div>
  );
}

function DecoderMapView({ results }: { results: DiscoveredDID[] }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3 max-h-[200px] overflow-y-auto">
      <div className="space-y-0.5">
        {results.map(d => {
          const level = getConfidenceLevel(d.decoderHint.confidence);
          const Icon = CONFIDENCE_ICON[level];
          const confColor = level === 'high' ? 'text-success' : level === 'medium' ? 'text-warning' : 'text-destructive';
          return (
            <div key={d.did} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon className={`w-3 h-3 flex-shrink-0 ${confColor}`} />
                <span className="font-mono text-[10px] text-primary">{d.didHex}</span>
                <span className={`text-[10px] px-1 rounded ${CLASS_BG[d.classification]} ${CLASS_COLORS[d.classification]} border`}>
                  {d.decoderHint.probableType}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground truncate ml-2 max-w-[100px]">
                {d.byteLength}B
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiscoveredDIDCard({ item, expanded, onToggle }: { item: DiscoveredDID; expanded: boolean; onToggle: () => void }) {
  const classColor = CLASS_COLORS[item.classification] || 'text-foreground';
  const classBg = CLASS_BG[item.classification] || '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg bg-card border border-border overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 active:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            item.classification === 'live' ? 'bg-success animate-pulse' :
            item.classification === 'unknown' ? 'bg-destructive' :
            item.classification === 'flags' ? 'bg-warning' : 'bg-accent'
          }`} />
          <span className="font-mono text-[10px] text-primary flex-shrink-0">{item.didHex}</span>
          <span className="text-xs text-foreground truncate">
            {item.knownInDB ? item.name : <span className="italic text-muted-foreground">Unknown</span>}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[9px] px-1 py-0.5 rounded border ${classBg} ${classColor} font-medium`}>
            {item.classification}
          </span>
          {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5 border-t border-border pt-2">
              <DetailRow label="Value" value={item.sampleValue} accent />
              <DetailRow label="Raw" value={item.sampleRaw} mono />
              <DetailRow label="Length" value={`${item.byteLength} bytes`} />
              <DetailRow label="Classification" value={item.classification} />
              <DetailRow label="Known in DB" value={item.knownInDB ? 'Yes ✓' : 'No — needs mapping'} />
              
              {/* Decoder Hint */}
              <div className="mt-2 p-2 rounded-md bg-muted/50 border border-border/50">
                <span className="text-[10px] text-muted-foreground font-medium">Decoder Hint</span>
                <div className="mt-1 space-y-0.5">
                  <DetailRow label="Type" value={item.decoderHint.probableType} />
                  <DetailRow label="Confidence" value={`${(item.decoderHint.confidence * 100).toFixed(0)}%`} />
                  <p className="text-[10px] text-muted-foreground italic">{item.decoderHint.reasoning}</p>
                </div>
              </div>

              {!item.knownInDB && (
                <div className="mt-1 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                  <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    Unknown DID — explore manually
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Read multiple times to check if value changes (live vs static)
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailRow({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-[10px] ${mono ? 'font-mono' : ''} ${accent ? 'text-accent font-medium' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
