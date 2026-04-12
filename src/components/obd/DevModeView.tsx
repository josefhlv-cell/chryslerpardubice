import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Trash2, Terminal, Wrench, Clock, Layers, Shield, ShieldAlert,
  AlertTriangle, Copy, Plus, Play, ChevronDown, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { getDIDDef } from '@/lib/obd/chrysler-dids';
import { parseDIDValue } from '@/lib/obd/uds-engine';

// ─── Types ───
type LogEntry = {
  type: 'tx' | 'rx' | 'error' | 'info' | 'warn';
  message: string;
  timestamp: number;
  latencyMs?: number;
  rawHex?: string;
  decoded?: string;
};

type TimingRecord = {
  command: string;
  latencyMs: number;
  timestamp: number;
};

type MultiFrameEntry = {
  id: string;
  frames: { index: number; hex: string; ts: number }[];
  totalExpected: number;
  complete: boolean;
  assembled?: string;
};

type DIDPreset = {
  name: string;
  service: string;
  did: string;
  description: string;
};

type DevTab = 'terminal' | 'builder' | 'timing' | 'multiframe';

const QUICK_COMMANDS = [
  { label: 'ATZ', cmd: 'ATZ', desc: 'Reset adaptéru' },
  { label: 'ATI', cmd: 'ATI', desc: 'Info adaptéru' },
  { label: 'ATRV', cmd: 'ATRV', desc: 'Napětí baterie' },
  { label: 'ATDP', cmd: 'ATDP', desc: 'Popis protokolu' },
  { label: 'ATSP0', cmd: 'ATSP0', desc: 'Auto protokol' },
  { label: 'ATH1', cmd: 'ATH1', desc: 'Hlavičky zap' },
  { label: 'ATH0', cmd: 'ATH0', desc: 'Hlavičky vyp' },
  { label: 'ATS0', cmd: 'ATS0', desc: 'Mezery vyp' },
  { label: 'ATMA', cmd: 'ATMA', desc: 'Monitor vše' },
  { label: '0100', cmd: '0100', desc: 'Podporované PID 01-20' },
  { label: '010C', cmd: '010C', desc: 'Otáčky' },
  { label: '010D', cmd: '010D', desc: 'Rychlost' },
];

const PRESET_DIDS: DIDPreset[] = [
  { name: 'VIN', service: '22', did: 'F190', description: 'Identifikační číslo vozidla' },
  { name: 'Relace', service: '22', did: 'F186', description: 'Aktivní diagnostická relace' },
  { name: 'App SW', service: '22', did: 'F188', description: 'ID aplikačního SW' },
  { name: 'Chladivo', service: '22', did: 'F420', description: 'Teplota chladiva motoru' },
  { name: 'Otáčky', service: '22', did: 'F426', description: 'Snímač otáček motoru' },
  { name: 'Plyn', service: '22', did: 'F424', description: 'Poloha škrtící klapky' },
  { name: 'Baterie', service: '22', did: 'F425', description: 'Napětí baterie' },
  { name: 'BCM blok', service: '22', did: '2105', description: 'Data řídicí jednotky karoserie' },
  { name: 'Motor bl.1', service: '22', did: '2101', description: 'Datový blok motoru 1' },
];

// ─── Hex/Decoded Helpers ───
function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16));
  }
  return bytes;
}

function tryDecodeResponse(rawHex: string): string | undefined {
  const bytes = hexToBytes(rawHex);
  if (bytes.length >= 3 && bytes[0] === 0x62) {
    const did = (bytes[1] << 8) | bytes[2];
    const payload = bytes.slice(3);
    const def = getDIDDef(did);
    const parsed = parseDIDValue(did, payload);
    return `${def.shortName}: ${parsed.stringValue}`;
  }
  if (bytes.length >= 3 && bytes[0] === 0x7F) {
    const svc = bytes[1].toString(16).toUpperCase().padStart(2, '0');
    const nrc = bytes[2].toString(16).toUpperCase().padStart(2, '0');
    return `NRC: Service 0x${svc}, Code 0x${nrc}`;
  }
  if (bytes.length >= 1 && bytes[0] === 0x50) return 'Session Control OK';
  if (bytes.length >= 1 && bytes[0] === 0x7E) return 'Tester Present OK';
  return undefined;
}

type Props = {
  onSend: (command: string) => Promise<string>;
  elmReady: boolean;
};

export function DevModeView({ onSend, elmReady }: Props) {
  const [activeTab, setActiveTab] = useState<DevTab>('terminal');
  const [writeMode, setWriteMode] = useState(false);
  const [showSafetyWarning, setShowSafetyWarning] = useState(false);
  const [showHexDecode, setShowHexDecode] = useState(true);

  // Terminal state
  const [input, setInput] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Builder state
  const [builderService, setBuilderService] = useState('22');
  const [builderDID, setBuilderDID] = useState('');
  const [builderSubfn, setBuilderSubfn] = useState('');

  // Timing state
  const [timings, setTimings] = useState<TimingRecord[]>([]);

  // Multi-frame state
  const [multiFrames, setMultiFrames] = useState<MultiFrameEntry[]>([]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const addLog = useCallback((type: LogEntry['type'], message: string, extras?: Partial<LogEntry>) => {
    setLog(prev => [...prev, { type, message, timestamp: Date.now(), ...extras }].slice(-200));
  }, []);

  // ─── Send Command with Timing ───
  const sendCommand = useCallback(async (cmd: string) => {
    if (!cmd.trim()) return;
    const upper = cmd.trim().toUpperCase();

    // Safety check for write commands
    if (!writeMode && (upper.startsWith('2E') || upper.startsWith('2F') || upper.startsWith('31') || upper.startsWith('27') || upper.startsWith('34') || upper.startsWith('36'))) {
      addLog('warn', `⚠ BLOCKED: Write command "${upper}" — enable experimental writes first`);
      return;
    }

    addLog('tx', upper);
    const t0 = performance.now();

    try {
      const response = await onSend(upper);
      const latencyMs = Math.round(performance.now() - t0);
      const cleanResp = response.replace(/\s+/g, ' ').trim();
      const decoded = tryDecodeResponse(cleanResp.replace(/\s/g, ''));

      addLog('rx', cleanResp, { latencyMs, rawHex: cleanResp, decoded });
      setTimings(prev => [...prev, { command: upper, latencyMs, timestamp: Date.now() }].slice(-100));

      // Multi-frame detection
      detectMultiFrame(cleanResp);
    } catch (e: any) {
      const latencyMs = Math.round(performance.now() - t0);
      addLog('error', e.message || 'Command failed', { latencyMs });
    }
  }, [onSend, writeMode, addLog]);

  const handleSend = () => { sendCommand(input); setInput(''); };

  // ─── Multi-frame detection ───
  const detectMultiFrame = (response: string) => {
    const parts = response.split(/\r|\n/).filter(Boolean);
    if (parts.length > 1) {
      const id = `MF-${Date.now()}`;
      const frames = parts.map((p, i) => ({ index: i, hex: p.trim(), ts: Date.now() }));
      setMultiFrames(prev => [...prev, {
        id, frames, totalExpected: frames.length, complete: true,
        assembled: frames.map(f => f.hex).join(' '),
      }].slice(-20));
    }
  };

  // ─── Build command from DID builder ───
  const buildCommand = () => {
    let cmd = builderService.toUpperCase();
    if (builderDID) cmd += builderDID.toUpperCase().padStart(4, '0');
    if (builderSubfn) cmd += builderSubfn.toUpperCase();
    return cmd;
  };

  // ─── Timing stats ───
  const avgLatency = timings.length > 0 ? Math.round(timings.reduce((s, t) => s + t.latencyMs, 0) / timings.length) : 0;
  const minLatency = timings.length > 0 ? Math.min(...timings.map(t => t.latencyMs)) : 0;
  const maxLatency = timings.length > 0 ? Math.max(...timings.map(t => t.latencyMs)) : 0;
  const p95Latency = timings.length > 0 ? timings.map(t => t.latencyMs).sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] : 0;

  // ─── Color helpers ───
  const getColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'tx': return 'text-primary';
      case 'rx': return 'text-emerald-400';
      case 'error': return 'text-destructive';
      case 'warn': return 'text-amber-400';
      case 'info': return 'text-muted-foreground';
    }
  };
  const getPrefix = (type: LogEntry['type']) => {
    switch (type) { case 'tx': return '→'; case 'rx': return '←'; case 'error': return '✗'; case 'warn': return '⚠'; case 'info': return '#'; }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header + Safety Toggle */}
      <div className="p-3 space-y-2 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Vývojářský režim</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={writeMode ? 'destructive' : 'secondary'} className="text-[9px] h-5 gap-1">
              {writeMode ? <ShieldAlert className="w-2.5 h-2.5" /> : <Shield className="w-2.5 h-2.5" />}
              {writeMode ? 'ZÁPIS' : 'POUZE ČTENÍ'}
            </Badge>
          </div>
        </div>

        {/* Safety Toggle */}
        <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
          writeMode ? 'bg-destructive/10 border border-destructive/30' : 'bg-muted/50'
        }`}>
          <div className="flex items-center gap-2">
            {writeMode && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
            <span className={writeMode ? 'text-destructive font-medium' : 'text-muted-foreground'}>
              {writeMode ? 'Experimentální zápisy POVOLENY — používejte opatrně!' : 'Bezpečný režim pouze pro čtení aktivní'}
            </span>
          </div>
          <Switch
            checked={writeMode}
            onCheckedChange={(v) => {
              if (v) setShowSafetyWarning(true);
              else { setWriteMode(false); setShowSafetyWarning(false); }
            }}
          />
        </div>

        {/* Safety Confirmation Dialog */}
        <AnimatePresence>
          {showSafetyWarning && !writeMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-destructive/10 border border-destructive/40 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-1">
                     <p className="text-xs font-semibold text-destructive">⚠ Bezpečnostní varování</p>
                     <p className="text-[10px] text-destructive/80">
                       Povolení režimu zápisu umožní služby 0x2E (WriteDataByID), 0x2F (IOControl),
                       0x31 (RoutineControl), 0x27 (SecurityAccess), 0x34/0x36 (Upload/Download).
                       Mohou trvale změnit kalibraci ECU, deaktivovat bezpečnostní systémy nebo zablokovat moduly.
                       Pokračujte pouze pokud rozumíte rizikům.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                   <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowSafetyWarning(false)}>
                     Zrušit
                   </Button>
                   <Button size="sm" variant="destructive" className="h-6 text-[10px]" onClick={() => {
                     const pin = prompt('Zadejte bezpečnostní PIN:');
                     if (pin === '321456') { setWriteMode(true); setShowSafetyWarning(false); }
                     else if (pin !== null) { alert('Nesprávný PIN'); }
                   }}>
                     Rozumím rizikům
                   </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Switcher */}
        <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5">
          {([
            { id: 'terminal' as const, icon: Terminal, label: 'RAW' },
            { id: 'builder' as const, icon: Wrench, label: 'Builder' },
            { id: 'timing' as const, icon: Clock, label: 'Timing' },
            { id: 'multiframe' as const, icon: Layers, label: 'Multi-Frame' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1 flex-1 justify-center text-[10px] py-1.5 rounded-md transition-colors font-medium ${
                activeTab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'terminal' && (
          <div className="flex flex-col h-full">
            {/* Quick Commands */}
            <div className="p-2 border-b border-border overflow-x-auto scrollbar-none">
              <div className="flex gap-1 min-w-max">
                {QUICK_COMMANDS.map(qc => (
                  <button
                    key={qc.cmd}
                    onClick={() => sendCommand(qc.cmd)}
                    disabled={!elmReady}
                    title={qc.desc}
                    className="px-2 py-1 rounded text-[10px] font-mono bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-30 shrink-0"
                  >
                    {qc.label}
                  </button>
                ))}
              </div>
            </div>

            {/* HEX/Decode Toggle */}
            <div className="flex items-center justify-between px-3 py-1 border-b border-border">
              <span className="text-[10px] text-muted-foreground">Show decoded values</span>
              <Switch checked={showHexDecode} onCheckedChange={setShowHexDecode} />
            </div>

            {/* Log Output */}
            <div className="flex-1 overflow-y-auto p-3 space-y-0.5 bg-background">
              {log.length === 0 && (
                <p className="text-xs text-muted-foreground font-mono py-4 text-center">
                  {elmReady ? 'Ready. Full AT, OBD-II, UDS command access.' : 'Initialize ELM327 first.'}
                </p>
              )}
              {log.map((entry, i) => (
                <div key={i} className="group">
                  <div className={`font-mono text-[11px] ${getColor(entry.type)} flex items-start gap-1`}>
                    <span className="opacity-30 shrink-0 w-16">
                      {new Date(entry.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 1 } as any)}
                    </span>
                    <span className="shrink-0 w-3">{getPrefix(entry.type)}</span>
                    <span className="break-all">{entry.message}</span>
                    {entry.latencyMs !== undefined && (
                      <span className="text-muted-foreground text-[9px] shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        {entry.latencyMs}ms
                      </span>
                    )}
                  </div>
                  {/* Decoded view */}
                  {showHexDecode && entry.decoded && entry.type === 'rx' && (
                    <div className="font-mono text-[10px] text-accent ml-[76px] opacity-70">
                      ↳ {entry.decoded}
                    </div>
                  )}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {activeTab === 'builder' && (
          <div className="p-3 space-y-3">
            {/* Custom Command Builder */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-foreground">Custom DID/PID Builder</h3>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Service</label>
                  <select
                    value={builderService}
                    onChange={e => setBuilderService(e.target.value)}
                    className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-foreground"
                  >
                    <option value="22">0x22 Read DID</option>
                    <option value="10">0x10 Session</option>
                    <option value="3E">0x3E Tester</option>
                    <option value="19">0x19 Read DTC</option>
                    {writeMode && <option value="2E">0x2E Write DID</option>}
                    {writeMode && <option value="2F">0x2F IO Ctrl</option>}
                    {writeMode && <option value="31">0x31 Routine</option>}
                    {writeMode && <option value="27">0x27 Security</option>}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">DID / Sub</label>
                  <input
                    value={builderDID}
                    onChange={e => setBuilderDID(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 4))}
                    placeholder="F190"
                    className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Extra Data</label>
                  <input
                    value={builderSubfn}
                    onChange={e => setBuilderSubfn(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
                    placeholder="Optional"
                    className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2 font-mono text-xs text-foreground border border-border">
                  {buildCommand()}
                </div>
                <Button size="sm" className="h-8 text-xs gap-1" disabled={!elmReady} onClick={() => sendCommand(buildCommand())}>
                  <Play className="w-3 h-3" /> Send
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { navigator.clipboard.writeText(buildCommand()); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* DID Presets */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-foreground">Chrysler DID Presets</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_DIDS.map(p => (
                  <button
                    key={p.did}
                    onClick={() => { setBuilderService(p.service); setBuilderDID(p.did); setBuilderSubfn(''); }}
                    className="text-left p-2 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{p.name}</span>
                      <span className="text-[9px] font-mono text-muted-foreground">0x{p.did}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{p.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* DID Range Scanner */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-foreground">Quick Range Scan</h3>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'F100–F1FF', start: 'F100', end: 'F1FF' },
                  { label: 'F420–F42E', start: 'F420', end: 'F42E' },
                  { label: '2101–210B', start: '2101', end: '210B' },
                ].map(r => (
                  <Button key={r.label} size="sm" variant="outline" className="h-7 text-[10px] gap-1"
                    onClick={async () => {
                      const start = parseInt(r.start, 16);
                      const end = parseInt(r.end, 16);
                      for (let did = start; did <= end; did++) {
                        await sendCommand(`22${did.toString(16).toUpperCase().padStart(4, '0')}`);
                      }
                    }}
                    disabled={!elmReady}
                  >
                    <Wrench className="w-2.5 h-2.5" /> {r.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'timing' && (
          <div className="p-3 space-y-3">
            <h3 className="text-xs font-semibold text-foreground">Latency Analyzer</h3>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: 'Avg', value: `${avgLatency}ms`, color: 'text-primary' },
                { label: 'Min', value: `${minLatency}ms`, color: 'text-emerald-400' },
                { label: 'Max', value: `${maxLatency}ms`, color: 'text-destructive' },
                { label: 'P95', value: `${p95Latency}ms`, color: 'text-amber-400' },
              ].map(s => (
                <div key={s.label} className="bg-card border border-border rounded-lg p-2 text-center">
                  <p className="text-[9px] text-muted-foreground">{s.label}</p>
                  <p className={`text-sm font-mono font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Timing Histogram */}
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Last {timings.length} commands</p>
              <div className="flex items-end gap-px h-20 bg-muted/30 rounded-lg p-1">
                {timings.slice(-60).map((t, i) => {
                  const maxH = Math.max(...timings.slice(-60).map(x => x.latencyMs), 1);
                  const h = (t.latencyMs / maxH) * 100;
                  const color = t.latencyMs > 200 ? 'bg-destructive' : t.latencyMs > 100 ? 'bg-amber-400' : 'bg-primary';
                  return (
                    <div key={i} className="flex-1 flex flex-col justify-end" title={`${t.command}: ${t.latencyMs}ms`}>
                      <div className={`${color} rounded-t-sm min-h-[1px] transition-all`} style={{ height: `${h}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Timing Table */}
            <div className="space-y-0.5 max-h-60 overflow-y-auto">
              {timings.slice().reverse().slice(0, 30).map((t, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-card text-[10px] font-mono">
                  <span className="text-foreground">{t.command}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {new Date(t.timestamp).toLocaleTimeString('en', { hour12: false })}
                    </span>
                    <span className={`font-bold ${t.latencyMs > 200 ? 'text-destructive' : t.latencyMs > 100 ? 'text-amber-400' : 'text-primary'}`}>
                      {t.latencyMs}ms
                    </span>
                  </div>
                </div>
              ))}
              {timings.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">Odešlete příkazy pro měření latence</p>
              )}
            </div>

            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setTimings([])}>
              <Trash2 className="w-3 h-3 mr-1" /> Smazat měření
            </Button>
          </div>
        )}

        {activeTab === 'multiframe' && (
          <div className="p-3 space-y-3">
             <h3 className="text-xs font-semibold text-foreground">Multi-Frame Monitor</h3>
             <p className="text-[10px] text-muted-foreground">
               Zachytává ISO-TP multi-frame odpovědi (např. VIN, velké datové bloky)
             </p>

             {multiFrames.length === 0 && (
               <p className="text-xs text-muted-foreground text-center py-8">
                 Zatím žádné multi-frame odpovědi. Zkuste přečíst VIN (22F190) nebo velké bloky.
               </p>
            )}

            {multiFrames.map((mf) => (
              <MultiFrameCard key={mf.id} entry={mf} />
            ))}

            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setMultiFrames([])}>
              <Trash2 className="w-3 h-3 mr-1" /> Smazat
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Input — always visible */}
      <div className="flex items-center gap-2 p-3 bg-card border-t border-border safe-bottom">
        <button onClick={() => setLog([])} className="p-2 text-muted-foreground active:text-foreground">
          <Trash2 className="w-4 h-4" />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={elmReady ? 'AT / OBD / UDS příkaz...' : 'Nepřipojeno'}
          disabled={!elmReady}
          className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none border border-border focus:border-primary transition-colors disabled:opacity-50"
        />
        <motion.button
          onClick={handleSend}
          disabled={!elmReady || !input.trim()}
          className="p-2 text-primary disabled:opacity-30"
          whileTap={{ scale: 0.9 }}
        >
          <Send className="w-5 h-5" />
        </motion.button>
      </div>
    </div>
  );
}

// ─── Multi-Frame Card ───
function MultiFrameCard({ entry }: { entry: MultiFrameEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          <span className="text-xs font-mono text-foreground">{entry.id}</span>
          <Badge variant={entry.complete ? 'default' : 'secondary'} className="text-[8px] h-4">
            {entry.frames.length} frames
          </Badge>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-2.5 space-y-1">
              {entry.frames.map(f => (
                <div key={f.index} className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-muted-foreground w-6">#{f.index}</span>
                  <span className="text-foreground break-all">{f.hex}</span>
                </div>
              ))}
              {entry.assembled && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-[9px] text-muted-foreground mb-1">Assembled</p>
                  <p className="text-[10px] font-mono text-primary break-all">{entry.assembled}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
