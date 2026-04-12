import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Square, ChevronDown, ChevronRight, Database, FileText, Cpu, Thermometer, Hash } from 'lucide-react';
import { useUDS, isDIDResult } from '@/hooks/obd/use-uds';
import { DID_SCAN_RANGES } from '@/lib/obd/chrysler-dids';
import type { DIDResult, ScanProgress } from '@/lib/obd/uds-engine';

type Props = {
  elmReady: boolean;
};

const CATEGORY_ICONS: Record<string, typeof Cpu> = {
  identification: FileText,
  software: Cpu,
  hardware: Cpu,
  sensor: Thermometer,
  config: Database,
  extended: Hash,
  dtc: FileText,
};

const CATEGORY_COLORS: Record<string, string> = {
  identification: 'text-primary',
  software: 'text-accent',
  sensor: 'text-success',
  hardware: 'text-warning',
  config: 'text-muted-foreground',
  extended: 'text-secondary',
  dtc: 'text-destructive',
};

export function UDSView({ elmReady }: Props) {
  const { scanProgress, results, scanning, scanRange, abortScan, readDID, setSession, clearResults } = useUDS();
  const [expandedDID, setExpandedDID] = useState<number | null>(null);
  const [singleDID, setSingleDID] = useState('F190');
  const [activeSession, setActiveSession] = useState(1);

  const handleScanRange = useCallback(async (start: number, end: number) => {
    // Switch to extended session for broader access
    await setSession(0x03);
    setActiveSession(3);
    await scanRange(start, end);
  }, [setSession, scanRange]);

  const handleSingleRead = useCallback(async () => {
    const did = parseInt(singleDID, 16);
    if (isNaN(did)) return;
    const result = await readDID(did);
    // Result is emitted via listener
  }, [singleDID, readDID]);

  if (!elmReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="w-20 h-20 rounded-2xl carbon-bg border border-border flex items-center justify-center">
          <Database className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Initialize ELM327 to access UDS diagnostics
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 pb-2">
      {/* Session Indicator */}
      <div className="flex items-center justify-between">
        <span className="text-label">UDS Session</span>
        <div className="flex gap-1">
          {[
            { id: 1, label: 'Default', code: 0x01 },
            { id: 3, label: 'Extended', code: 0x03 },
          ].map(s => (
            <button
              key={s.id}
              onClick={async () => { await setSession(s.code); setActiveSession(s.id); }}
              className={`px-2 py-1 rounded text-[10px] font-mono font-medium transition-colors ${
                activeSession === s.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Single DID Read */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center bg-muted rounded-lg border border-border px-3">
          <span className="text-xs text-muted-foreground font-mono mr-1">0x</span>
          <input
            value={singleDID}
            onChange={e => setSingleDID(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 4))}
            className="flex-1 bg-transparent py-2 text-sm font-mono text-foreground outline-none"
            placeholder="F190"
            maxLength={4}
          />
        </div>
        <motion.button
          onClick={handleSingleRead}
          disabled={singleDID.length < 4}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-30"
          whileTap={{ scale: 0.95 }}
        >
          Read
        </motion.button>
      </div>

      {/* Scan Ranges */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-label">Scan Ranges</span>
          {results.length > 0 && (
            <button onClick={clearResults} className="text-[10px] text-destructive font-medium">
              Clear All
            </button>
          )}
        </div>
        {DID_SCAN_RANGES.map(range => (
          <motion.button
            key={range.start}
            onClick={() => scanning ? abortScan() : handleScanRange(range.start, range.end)}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-card border border-border active:bg-muted transition-colors"
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-medium text-foreground">{range.label}</span>
            </div>
            {scanning && scanProgress && scanProgress.currentDID >= range.start && scanProgress.currentDID <= range.end ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-accent">
                  {scanProgress.current}/{scanProgress.total} ({scanProgress.found})
                </span>
                <Square className="w-3 h-3 text-destructive fill-destructive" />
              </div>
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </motion.button>
        ))}
      </div>

      {/* Scan Progress Bar */}
      {scanning && scanProgress && (
        <div className="space-y-1">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent rounded-full"
              animate={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <p className="text-[10px] font-mono text-muted-foreground text-center">
            Scanning 0x{scanProgress.currentDID.toString(16).toUpperCase().padStart(4, '0')}...
          </p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1">
          <span className="text-label">{results.length} DIDs Found</span>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            <AnimatePresence>
              {results.map(result => (
                <DIDResultCard
                  key={result.did}
                  result={result}
                  expanded={expandedDID === result.did}
                  onToggle={() => setExpandedDID(expandedDID === result.did ? null : result.did)}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

function DIDResultCard({ result, expanded, onToggle }: { result: DIDResult; expanded: boolean; onToggle: () => void }) {
  const Icon = CATEGORY_ICONS[result.definition.category] || FileText;
  const colorClass = CATEGORY_COLORS[result.definition.category] || 'text-foreground';

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
          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${colorClass}`} />
          <span className="font-mono text-[10px] text-primary flex-shrink-0">{result.didHex}</span>
          <span className="text-xs text-foreground truncate">{result.definition.shortName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono text-[10px] text-accent max-w-[120px] truncate">
            {result.parsed.stringValue}
          </span>
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
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
            <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
              <DetailRow label="Name" value={result.definition.name} />
              <DetailRow label="Category" value={result.definition.category} />
              <DetailRow label="Type" value={result.parsed.type} />
              <DetailRow label="Value" value={result.parsed.stringValue} accent />
              {result.parsed.numericValue !== undefined && (
                <DetailRow label="Numeric" value={String(result.parsed.numericValue)} />
              )}
              <DetailRow label="Raw" value={result.rawHex} mono />
              <DetailRow label="Length" value={`${result.rawBytes.length} bytes`} />
              {result.definition.description && (
                <p className="text-[10px] text-muted-foreground italic">{result.definition.description}</p>
              )}

              {/* Bitfield Details */}
              {result.parsed.bitfields && (
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Bitfields:</span>
                  {result.parsed.bitfields.map((bf, i) => (
                    <div key={i} className="flex justify-between items-center pl-2">
                      <span className="text-[10px] text-muted-foreground">{bf.name}</span>
                      <span className={`text-[10px] font-mono ${bf.value ? 'text-primary' : 'text-muted-foreground'}`}>
                        {bf.label}
                      </span>
                    </div>
                  ))}
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
