import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Camera, CameraOff, Download, Trash2, Activity, Search, ArrowRightLeft, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useReverseEngine } from '@/hooks/obd/use-reverse-engine';
import type { ByteAnalysis, BeforeAfterResult, DecoderEntry } from '@/lib/obd/reverse-engine';

const DEFAULT_RE_DIDS = [0xF420, 0xF421, 0xF422, 0xF424, 0xF425, 0xF426, 0xF427, 0xF42B, 0xF42E];

type RETab = 'analyze' | 'beforeafter' | 'decoder';

export function ReverseEngineeringView({ elmReady }: { elmReady: boolean }) {
  const {
    analyses, running, beforeSnapshot, afterResults, decoderMap, pollCount,
    startMonitoring, stopMonitoring, markBefore, markAfter, clearBeforeAfter, clearAll, exportDecoder,
  } = useReverseEngine();
  const [tab, setTab] = useState<RETab>('analyze');

  const handleToggle = useCallback(() => {
    if (running) stopMonitoring();
    else startMonitoring(DEFAULT_RE_DIDS);
  }, [running, startMonitoring, stopMonitoring]);

  const handleMarkBefore = useCallback(() => markBefore(DEFAULT_RE_DIDS), [markBefore]);

  const handleExport = useCallback(() => {
    const json = exportDecoder();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'decoder-map.json'; a.click();
    URL.revokeObjectURL(url);
  }, [exportDecoder]);

  const tabs: { id: RETab; label: string; icon: typeof Activity }[] = [
    { id: 'analyze', label: 'Byte Analysis', icon: Activity },
    { id: 'beforeafter', label: 'Before/After', icon: ArrowRightLeft },
    { id: 'decoder', label: 'Decoder Map', icon: BookOpen },
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            Reverse Engineering
          </h2>
          <p className="text-[10px] text-muted-foreground">Byte-level DID analysis • Polls: {pollCount}</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant={running ? 'destructive' : 'default'} onClick={handleToggle} className="h-7 text-xs">
            {running ? <Square className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
            {running ? 'Stop' : 'Start'}
          </Button>
          <Button size="sm" variant="outline" onClick={clearAll} className="h-7 text-xs">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
              tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tab === 'analyze' && <ByteAnalysisTab analyses={analyses} />}
          {tab === 'beforeafter' && (
            <BeforeAfterTab
              beforeSnapshot={beforeSnapshot}
              afterResults={afterResults}
              onMarkBefore={handleMarkBefore}
              onMarkAfter={markAfter}
              onClear={clearBeforeAfter}
            />
          )}
          {tab === 'decoder' && <DecoderMapTab decoderMap={decoderMap} onExport={handleExport} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ByteAnalysisTab({ analyses }: { analyses: Map<number, ByteAnalysis[]> }) {
  const entries = Array.from(analyses.entries());

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        Start monitoring to begin byte-level analysis
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map(([did, bytes]) => (
        <div key={did} className="bg-card rounded-lg border border-border p-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-bold text-primary">
              0x{did.toString(16).toUpperCase().padStart(4, '0')}
            </span>
            <span className="text-[9px] text-muted-foreground">{bytes.length} bytes</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {bytes.map(b => {
              const color = b.activityScore > 0.5
                ? 'bg-destructive/20 border-destructive/40 text-destructive'
                : b.activityScore > 0.1
                ? 'bg-chart-4/20 border-chart-4/40 text-chart-4'
                : 'bg-muted/50 border-border text-muted-foreground';
              return (
                <div key={b.byteIndex} className={`rounded border p-1 text-center ${color}`}>
                  <div className="text-[9px] font-mono">B{b.byteIndex}</div>
                  <div className="text-[8px]">{b.classification}</div>
                  {b.correlationTarget && (
                    <div className="text-[7px] text-primary truncate">≈{b.correlationTarget}</div>
                  )}
                </div>
              );
            })}
          </div>
          {bytes.some(b => b.suggestion) && (
            <div className="mt-1.5 space-y-0.5">
              {bytes.filter(b => b.activityScore > 0.1 || b.correlationTarget).slice(0, 3).map(b => (
                <div key={b.byteIndex} className="text-[9px] text-muted-foreground">
                  💡 {b.suggestion}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BeforeAfterTab({
  beforeSnapshot, afterResults, onMarkBefore, onMarkAfter, onClear,
}: {
  beforeSnapshot: any;
  afterResults: BeforeAfterResult[];
  onMarkBefore: () => void;
  onMarkAfter: () => BeforeAfterResult[];
  onClear: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onMarkBefore} className="h-8 text-xs flex-1">
          <Camera className="w-3 h-3 mr-1" />
          Mark BEFORE
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={onMarkAfter}
          disabled={!beforeSnapshot}
          className="h-8 text-xs flex-1"
        >
          <CameraOff className="w-3 h-3 mr-1" />
          Mark AFTER
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} className="h-8 text-xs">
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {beforeSnapshot && !afterResults.length && (
        <div className="text-center py-4 text-xs text-chart-4">
          ⏳ BEFORE snapshot captured. Perform your action, then click Mark AFTER.
        </div>
      )}

      {afterResults.length > 0 && (
        <div className="space-y-2">
          {afterResults.map(r => (
            <div key={r.did} className="bg-card rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-mono font-bold text-primary">{r.didHex}</span>
                <Badge variant={r.significance > 0.3 ? 'destructive' : 'secondary'} className="text-[9px]">
                  {(r.significance * 100).toFixed(0)}% changed
                </Badge>
              </div>
              <div className="space-y-1">
                {r.byteChanges.map(c => (
                  <div key={c.index} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-muted-foreground">B{c.index}:</span>
                    <span className="text-destructive">0x{c.before.toString(16).toUpperCase().padStart(2, '0')}</span>
                    <span className="text-muted-foreground">→</span>
                    <motion.span
                      className="text-primary font-bold"
                      initial={{ scale: 1.3, color: 'hsl(var(--chart-1))' }}
                      animate={{ scale: 1 }}
                    >
                      0x{c.after.toString(16).toUpperCase().padStart(2, '0')}
                    </motion.span>
                    <span className="text-muted-foreground">(Δ{c.delta >= 0 ? '+' : ''}{c.delta})</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!beforeSnapshot && afterResults.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-xs">
          Use Before/After to detect byte changes when you perform an action (e.g., press throttle)
        </div>
      )}
    </div>
  );
}

function DecoderMapTab({ decoderMap, onExport }: { decoderMap: Map<number, DecoderEntry>; onExport: () => void }) {
  const entries = Array.from(decoderMap.values());

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onExport} className="h-7 text-xs" disabled={entries.length === 0}>
          <Download className="w-3 h-3 mr-1" />
          Export JSON
        </Button>
      </div>
      {entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-xs">
          Decoder map will be auto-built from analysis data
        </div>
      ) : (
        entries.slice(0, 20).map(e => (
          <div key={e.did} className="bg-card rounded-lg border border-border p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-mono font-bold text-foreground">{e.didHex}</span>
              <div className="flex gap-1">
                {e.isEdited && <Badge variant="outline" className="text-[8px]">edited</Badge>}
                <span className="text-[9px] text-muted-foreground">{e.bytes.length}B</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {e.bytes.slice(0, 8).map(b => (
                <span key={b.byteIndex} className="text-[8px] bg-muted/50 rounded px-1 py-0.5 font-mono">
                  {b.label.split(':')[0] || `B${b.byteIndex}`}
                </span>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
