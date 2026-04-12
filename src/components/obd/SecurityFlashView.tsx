import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Unlock, Key, Download, ArrowRight, AlertTriangle, ChevronDown, ChevronUp, Play, RotateCcw, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─── Types ───
type SecurityState = 'locked' | 'seed-requested' | 'key-sent' | 'unlocked' | 'failed';
type FlashPhase = 'idle' | 'request-download' | 'transferring' | 'transfer-exit' | 'complete';

type UDSFrame = {
  id: number;
  direction: 'tx' | 'rx';
  service: string;
  raw: string;
  decoded: string;
  timestamp: number;
  frameType?: 'SF' | 'FF' | 'CF' | 'FC';
};

// ─── Simulated Seeds ───
function generateSeed(): number[] {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256));
}

function computeKey(seed: number[]): number[] {
  // Simulated Chrysler-style seed/key: XOR with constant + rotate
  return seed.map((b, i) => ((b ^ 0xA5) + (i * 0x11)) & 0xFF);
}

function toHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function toHexCompact(bytes: number[]): string {
  return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
}

// ─── Multi-frame simulation data ───
const FLASH_BLOCKS = [
  { name: 'Application SW', address: 0x00010000, size: 0x3E000, type: 'app' },
  { name: 'Calibration Data', address: 0x0003F000, size: 0x01000, type: 'cal' },
  { name: 'Boot Loader', address: 0x00000000, size: 0x10000, type: 'boot' },
];

// ─── Security Access Panel ───
function SecurityAccessPanel() {
  const [state, setState] = useState<SecurityState>('locked');
  const [seed, setSeed] = useState<number[]>([]);
  const [key, setKey] = useState<number[]>([]);
  const [frames, setFrames] = useState<UDSFrame[]>([]);
  const [accessLevel, setAccessLevel] = useState(0x01);
  const frameId = useRef(0);

  const addFrame = useCallback((dir: 'tx' | 'rx', service: string, raw: string, decoded: string) => {
    setFrames(prev => [...prev, {
      id: frameId.current++,
      direction: dir,
      service,
      raw,
      decoded,
      timestamp: Date.now(),
    }]);
  }, []);

  const requestSeed = useCallback(async () => {
    const subFn = accessLevel.toString(16).toUpperCase().padStart(2, '0');
    addFrame('tx', '0x27', `27 ${subFn}`, `SecurityAccess: requestSeed (level 0x${subFn})`);
    setState('seed-requested');

    await new Promise(r => setTimeout(r, 300 + Math.random() * 200));

    const newSeed = generateSeed();
    setSeed(newSeed);
    addFrame('rx', '0x67', `67 ${subFn} ${toHex(newSeed)}`, `Positive response: seed = [${toHex(newSeed)}]`);
  }, [accessLevel, addFrame]);

  const sendKey = useCallback(async () => {
    const newKey = computeKey(seed);
    setKey(newKey);
    const subFn = (accessLevel + 1).toString(16).toUpperCase().padStart(2, '0');
    addFrame('tx', '0x27', `27 ${subFn} ${toHex(newKey)}`, `SecurityAccess: sendKey (level 0x${subFn}) key=[${toHex(newKey)}]`);
    setState('key-sent');

    await new Promise(r => setTimeout(r, 400 + Math.random() * 300));

    // 80% success simulation
    if (Math.random() > 0.2) {
      addFrame('rx', '0x67', `67 ${subFn}`, 'Positive response: Security Access Granted ✓');
      setState('unlocked');
    } else {
      addFrame('rx', '0x7F', `7F 27 35`, 'Negative response: NRC 0x35 (Invalid Key)');
      setState('failed');
    }
  }, [seed, accessLevel, addFrame]);

  const reset = useCallback(() => {
    setState('locked');
    setSeed([]);
    setKey([]);
    setFrames([]);
  }, []);

  const stateConfig: Record<SecurityState, { color: string; icon: typeof Lock; label: string }> = {
    'locked': { color: 'text-destructive', icon: Lock, label: 'Locked' },
    'seed-requested': { color: 'text-amber-400', icon: Key, label: 'Seed Received' },
    'key-sent': { color: 'text-amber-400', icon: Key, label: 'Key Sent...' },
    'unlocked': { color: 'text-emerald-400', icon: Unlock, label: 'Unlocked' },
    'failed': { color: 'text-destructive', icon: AlertTriangle, label: 'Access Denied' },
  };

  const cfg = stateConfig[state];

  return (
    <div className="space-y-4">
      {/* Safety Warning */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <p className="text-xs text-destructive">
          <strong>SIMULATION ONLY</strong> — No actual ECU communication. All seed/key exchanges are simulated locally for educational purposes.
        </p>
      </div>

      {/* Status */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ scale: state === 'unlocked' ? [1, 1.1, 1] : 1 }}
                transition={{ repeat: state === 'unlocked' ? Infinity : 0, duration: 2 }}
              >
                <cfg.icon className={`w-8 h-8 ${cfg.color}`} />
              </motion.div>
              <div>
                <p className="font-bold text-foreground">{cfg.label}</p>
                <p className="text-xs text-muted-foreground">Service 0x27 — Security Access</p>
              </div>
            </div>
            <Badge variant={state === 'unlocked' ? 'default' : 'secondary'}>
              Level 0x{accessLevel.toString(16).toUpperCase().padStart(2, '0')}
            </Badge>
          </div>

          {/* Access Level Selector */}
          <div className="flex gap-2 mb-4">
            {[0x01, 0x03, 0x11, 0x61].map(level => (
              <Button
                key={level}
                variant={accessLevel === level ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setAccessLevel(level); reset(); }}
                className="text-xs"
              >
                0x{level.toString(16).toUpperCase().padStart(2, '0')}
              </Button>
            ))}
          </div>

          {/* Workflow Steps */}
          <div className="flex items-center gap-2 mb-4">
            {['Request Seed', 'Send Key', 'Result'].map((step, i) => {
              const stepStates: SecurityState[][] = [
                ['seed-requested', 'key-sent', 'unlocked', 'failed'],
                ['key-sent', 'unlocked', 'failed'],
                ['unlocked', 'failed'],
              ];
              const active = stepStates[i].includes(state);
              return (
                <div key={step} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>{step}</div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={requestSeed}
              disabled={state !== 'locked' && state !== 'failed'}
            >
              <Key className="w-3 h-3 mr-1" /> Request Seed
            </Button>
            <Button
              size="sm"
              onClick={sendKey}
              disabled={state !== 'seed-requested'}
              variant="secondary"
            >
              <Unlock className="w-3 h-3 mr-1" /> Send Key
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>

          {/* Seed/Key Display */}
          <AnimatePresence>
            {seed.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-4 overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-muted/50 border border-border">
                    <p className="text-[10px] text-muted-foreground mb-1">SEED (ECU → Tester)</p>
                    <p className="text-xs font-mono text-foreground">{toHex(seed)}</p>
                  </div>
                  {key.length > 0 && (
                    <div className="p-2 rounded bg-muted/50 border border-border">
                      <p className="text-[10px] text-muted-foreground mb-1">KEY (Tester → ECU)</p>
                      <p className="text-xs font-mono text-foreground">{toHex(key)}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Frame Log */}
      {frames.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm">UDS Frame Log</CardTitle>
          </CardHeader>
          <CardContent className="p-2 max-h-48 overflow-y-auto">
            {frames.map(f => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: f.direction === 'tx' ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-start gap-2 p-1.5 rounded text-[10px] font-mono mb-1 ${
                  f.direction === 'tx' ? 'bg-primary/5' : 'bg-secondary/30'
                }`}
              >
                <Badge variant="outline" className={`text-[9px] shrink-0 ${
                  f.direction === 'tx' ? 'text-primary' : 'text-secondary-foreground'
                }`}>
                  {f.direction === 'tx' ? 'TX →' : '← RX'}
                </Badge>
                <div>
                  <span className="text-muted-foreground">[{f.service}]</span>{' '}
                  <span className="text-foreground">{f.raw}</span>
                  <p className="text-muted-foreground mt-0.5">{f.decoded}</p>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Flash Download Simulation ───
function FlashDownloadPanel() {
  const [phase, setPhase] = useState<FlashPhase>('idle');
  const [selectedBlock, setSelectedBlock] = useState(0);
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<UDSFrame[]>([]);
  const [expandedBlock, setExpandedBlock] = useState<number | null>(null);
  const frameId = useRef(0);
  const abortRef = useRef(false);

  const addFrame = useCallback((dir: 'tx' | 'rx', service: string, raw: string, decoded: string, frameType?: UDSFrame['frameType']) => {
    setFrames(prev => [...prev.slice(-50), {
      id: frameId.current++,
      direction: dir,
      service,
      raw,
      decoded,
      timestamp: Date.now(),
      frameType,
    }]);
  }, []);

  const simulateFlash = useCallback(async () => {
    abortRef.current = false;
    const block = FLASH_BLOCKS[selectedBlock];
    setFrames([]);
    setProgress(0);

    // Phase 1: Request Download (0x34)
    setPhase('request-download');
    const addrHex = block.address.toString(16).toUpperCase().padStart(8, '0');
    const sizeHex = block.size.toString(16).toUpperCase().padStart(8, '0');
    addFrame('tx', '0x34', `34 00 44 ${addrHex} ${sizeHex}`, `RequestDownload: addr=0x${addrHex} size=0x${sizeHex}`, 'SF');
    await new Promise(r => setTimeout(r, 500));
    if (abortRef.current) return;
    
    const blockSize = 0x0FFE;
    const bsHex = blockSize.toString(16).toUpperCase().padStart(4, '0');
    addFrame('rx', '0x74', `74 20 ${bsHex}`, `Positive: maxBlockSize=${blockSize} bytes`, 'SF');
    await new Promise(r => setTimeout(r, 300));

    // Phase 2: Transfer Data (0x36)
    setPhase('transferring');
    const totalBlocks = Math.ceil(block.size / blockSize);
    
    for (let i = 0; i < totalBlocks; i++) {
      if (abortRef.current) break;
      const seq = ((i + 1) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
      const chunkSize = Math.min(blockSize, block.size - i * blockSize);
      
      // Show multi-frame structure for first few + last
      if (i < 3 || i === totalBlocks - 1) {
        const dataPreview = Array.from({ length: 6 }, () =>
          Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0')
        ).join(' ');

        if (chunkSize > 7) {
          // Multi-frame: First Frame
          addFrame('tx', '0x36', `36 ${seq} ${dataPreview}...`, `TransferData: block ${i + 1}/${totalBlocks} (${chunkSize} bytes)`, 'FF');
          await new Promise(r => setTimeout(r, 40));
          
          // Flow Control
          addFrame('rx', 'FC', `30 00 0A`, 'FlowControl: ContinueSend, BS=0, STmin=10ms', 'FC');
          await new Promise(r => setTimeout(r, 30));
          
          // Consecutive frames (show 2)
          for (let cf = 1; cf <= 2; cf++) {
            const cfData = Array.from({ length: 7 }, () =>
              Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0')
            ).join(' ');
            addFrame('tx', 'CF', `2${cf} ${cfData}`, `ConsecutiveFrame #${cf}`, 'CF');
            await new Promise(r => setTimeout(r, 15));
          }
        } else {
          addFrame('tx', '0x36', `36 ${seq} ${dataPreview}`, `TransferData: block ${i + 1}/${totalBlocks}`, 'SF');
        }
        
        await new Promise(r => setTimeout(r, 50));
        addFrame('rx', '0x76', `76 ${seq}`, `Positive: block ${i + 1} accepted ✓`, 'SF');
      }
      
      setProgress(((i + 1) / totalBlocks) * 100);
      await new Promise(r => setTimeout(r, i < 3 ? 200 : 30));
    }

    if (abortRef.current) { setPhase('idle'); return; }

    // Phase 3: Transfer Exit (0x37)
    setPhase('transfer-exit');
    addFrame('tx', '0x37', `37`, 'RequestTransferExit', 'SF');
    await new Promise(r => setTimeout(r, 400));
    addFrame('rx', '0x77', `77`, 'Positive: Transfer complete ✓', 'SF');
    
    setPhase('complete');
  }, [selectedBlock, addFrame]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setPhase('idle');
    setProgress(0);
    setFrames([]);
  }, []);

  const block = FLASH_BLOCKS[selectedBlock];

  return (
    <div className="space-y-4">
      {/* Safety Warning */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <p className="text-xs text-destructive">
          <strong>EDUCATIONAL SIMULATION</strong> — No real flash operations. Demonstrates UDS services 0x34, 0x36, 0x37 data flow and ISO-TP multi-frame structure.
        </p>
      </div>

      {/* Block Selector */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">Memory Blocks</CardTitle>
          <CardDescription className="text-xs">Simulated ECU memory layout</CardDescription>
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          {FLASH_BLOCKS.map((b, i) => (
            <div key={i}>
              <button
                onClick={() => { setSelectedBlock(i); setExpandedBlock(expandedBlock === i ? null : i); }}
                className={`w-full flex items-center justify-between p-2 rounded text-xs transition-colors ${
                  selectedBlock === i ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30 border border-transparent hover:border-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    b.type === 'boot' ? 'bg-destructive' : b.type === 'cal' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`} />
                  <span className="font-medium text-foreground">{b.name}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-mono">0x{b.address.toString(16).toUpperCase().padStart(8, '0')}</span>
                  {expandedBlock === i ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
              </button>
              <AnimatePresence>
                {expandedBlock === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-2 ml-4 text-[10px] text-muted-foreground space-y-1 border-l-2 border-border">
                      <p>Address: <span className="font-mono text-foreground">0x{b.address.toString(16).toUpperCase().padStart(8, '0')}</span></p>
                      <p>Size: <span className="font-mono text-foreground">0x{b.size.toString(16).toUpperCase()} ({(b.size / 1024).toFixed(0)} KB)</span></p>
                      <p>Type: <span className="text-foreground capitalize">{b.type === 'app' ? 'Application' : b.type === 'cal' ? 'Calibration' : 'Bootloader'}</span></p>
                      <p className={b.type === 'boot' ? 'text-destructive' : ''}>
                        {b.type === 'boot' ? '⚠ Protected — not writable in normal session' : 'Writable in extended session'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Flash Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-foreground">{block.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {(block.size / 1024).toFixed(0)} KB • {Math.ceil(block.size / 0x0FFE)} blocks
              </p>
            </div>
            <Badge variant={
              phase === 'complete' ? 'default' :
              phase === 'idle' ? 'secondary' : 'outline'
            }>
              {phase === 'idle' ? 'Ready' :
               phase === 'request-download' ? '0x34 Requesting...' :
               phase === 'transferring' ? '0x36 Transferring' :
               phase === 'transfer-exit' ? '0x37 Finishing' : 'Complete ✓'}
            </Badge>
          </div>

          {phase !== 'idle' && (
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{progress.toFixed(1)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={simulateFlash}
              disabled={phase !== 'idle' && phase !== 'complete'}
            >
              <Play className="w-3 h-3 mr-1" /> Simulate Flash
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Frame Visualization */}
      {frames.length > 0 && (
        <MultiFrameVisualization frames={frames} />
      )}
    </div>
  );
}

// ─── Multi-Frame Transfer Visualization ───
function MultiFrameVisualization({ frames }: { frames: UDSFrame[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [frames]);

  const frameTypeColors: Record<string, string> = {
    'SF': 'bg-primary/20 text-primary border-primary/30',
    'FF': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'CF': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'FC': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="w-4 h-4" /> ISO-TP Multi-Frame View
          </CardTitle>
          <div className="flex gap-1">
            {Object.entries(frameTypeColors).map(([type, cls]) => (
              <span key={type} className={`text-[8px] px-1.5 py-0.5 rounded border ${cls}`}>{type}</span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <div ref={scrollRef} className="max-h-64 overflow-y-auto space-y-0.5">
          {frames.map(f => {
            const ftCls = frameTypeColors[f.frameType || 'SF'] || frameTypeColors['SF'];
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-start gap-1.5 text-[10px] font-mono"
              >
                {/* Direction indicator */}
                <div className={`w-1 self-stretch rounded-full shrink-0 ${
                  f.direction === 'tx' ? 'bg-primary' : 'bg-secondary'
                }`} />
                
                {/* Frame type badge */}
                {f.frameType && (
                  <span className={`text-[8px] px-1 py-0.5 rounded border shrink-0 ${ftCls}`}>
                    {f.frameType}
                  </span>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">{f.direction === 'tx' ? '→' : '←'}</span>
                    <span className="text-foreground truncate">{f.raw}</span>
                  </div>
                  <p className="text-muted-foreground truncate">{f.decoded}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───
export function SecurityFlashView() {
  return (
    <div className="p-4 pb-20">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">Security & Flash Simulation</h1>
      </div>

      <Tabs defaultValue="security" className="w-full">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="security" className="flex-1 text-xs">
            <Lock className="w-3 h-3 mr-1" /> Security Access
          </TabsTrigger>
          <TabsTrigger value="flash" className="flex-1 text-xs">
            <Download className="w-3 h-3 mr-1" /> Flash Download
          </TabsTrigger>
        </TabsList>

        <TabsContent value="security">
          <SecurityAccessPanel />
        </TabsContent>

        <TabsContent value="flash">
          <FlashDownloadPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
