import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, Shield, ShieldAlert, ShieldCheck, Undo2, Check, AlertTriangle, Loader2, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCoding } from '@/hooks/use-coding';
import { useVehicle } from '@/hooks/use-vehicle';
import { CHRYSLER_DATABASE } from '@/lib/chrysler-database';
import type { CodingOption, WriteMode, CodingCategory } from '@/lib/coding-system';
import { t } from '@/lib/i18n';

const CATEGORY_ICONS: Record<CodingCategory, string> = {
  comfort: '🛋️',
  lighting: '💡',
  climate: '❄️',
  dashboard: '📊',
  sound: '🔊',
};

const CATEGORY_LABELS: Record<CodingCategory, string> = {
  comfort: t.coding.comfort,
  lighting: t.coding.lighting,
  climate: t.coding.climate,
  dashboard: t.coding.dashboardCat,
  sound: t.coding.sound,
};

const MODE_CONFIG: Record<WriteMode, { label: string; icon: typeof Shield; color: string; desc: string }> = {
  simulated: { label: t.coding.simulated, icon: Shield, color: 'text-primary', desc: t.coding.simulatedDesc },
  live_safe: { label: t.coding.liveSafe, icon: ShieldCheck, color: 'text-chart-4', desc: t.coding.liveSafeDesc },
  live_advanced: { label: t.coding.liveAdvanced, icon: ShieldAlert, color: 'text-destructive', desc: t.coding.liveAdvancedDesc },
};

export function CodingView({ elmReady }: { elmReady: boolean }) {
  const {
    options, backups, writeMode, writeInProgress, lastWriteResult,
    readAll, setMode, setPending, clearPending, executeWrite, rollback,
  } = useCoding();
  const { vehicle, isPacifica } = useVehicle();

  const [confirmDID, setConfirmDID] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<CodingCategory>('comfort');

  // Build a map of restrictedOnPacifica from chrysler-database
  const dbRestrictions = useMemo(() => {
    const map = new Map<number, { restricted: boolean; notes: string; writeSafe: boolean }>();
    CHRYSLER_DATABASE.codingDIDs.forEach(d => {
      map.set(d.did, { restricted: d.restrictedOnPacifica, notes: d.notes, writeSafe: d.writeSafe });
    });
    return map;
  }, []);

  // Filter options: on Pacifica, mark restricted DIDs
  const vehicleOptions = useMemo(() => {
    return options.map(opt => {
      const dbInfo = dbRestrictions.get(opt.did);
      const isRestricted = isPacifica && dbInfo?.restricted === true;
      return { ...opt, isRestricted, dbNotes: dbInfo?.notes ?? '', dbWriteSafe: dbInfo?.writeSafe ?? true };
    });
  }, [options, isPacifica, dbRestrictions]);

  const categories = Array.from(new Set(vehicleOptions.map(o => o.category))) as CodingCategory[];
  const filteredOptions = vehicleOptions.filter(o => o.category === activeCategory);

  const handleApply = useCallback(async (did: number, value: number) => {
    if (writeMode !== 'simulated') {
      setConfirmDID(did);
      return;
    }
    await executeWrite(did, value);
  }, [writeMode, executeWrite]);

  const handleConfirm = useCallback(async () => {
    if (confirmDID === null) return;
    const opt = options.find(o => o.did === confirmDID);
    if (opt?.pendingValue !== null && opt?.pendingValue !== undefined) {
      await executeWrite(confirmDID, opt.pendingValue);
    }
    setConfirmDID(null);
  }, [confirmDID, options, executeWrite]);

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            {t.coding.title}
          </h2>
          <p className="text-[10px] text-muted-foreground">{t.coding.subtitle}</p>
        </div>
        <Button size="sm" variant="outline" onClick={readAll} className="h-7 text-xs">
          {t.coding.readAll}
        </Button>
      </div>

      {/* Write Mode Selector */}
      <div className="bg-card rounded-lg border border-border p-2">
        <div className="text-[10px] text-muted-foreground mb-1.5">{t.coding.writeMode}</div>
        <div className="flex gap-1">
          {(Object.keys(MODE_CONFIG) as WriteMode[]).map(mode => {
            const cfg = MODE_CONFIG[mode];
            const active = writeMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setMode(mode)}
                className={`flex-1 flex flex-col items-center gap-0.5 p-1.5 rounded-md text-[9px] transition-colors border ${
                  active ? 'border-primary bg-primary/10 text-foreground' : 'border-transparent text-muted-foreground'
                }`}
              >
                <cfg.icon className={`w-3.5 h-3.5 ${active ? cfg.color : ''}`} />
                {cfg.label}
              </button>
            );
          })}
        </div>
        <p className="text-[9px] text-muted-foreground mt-1">{MODE_CONFIG[writeMode].desc}</p>
      </div>

      {/* Live Advanced Warning */}
      {writeMode === 'live_advanced' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-[10px] text-destructive">
            <strong>{t.coding.warningLiveAdvanced.split(':')[0]}:</strong>{t.coding.warningLiveAdvanced.split(':').slice(1).join(':')}
          </div>
        </motion.div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'
            }`}
          >
            {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Options */}
      <div className="space-y-2">
        <AnimatePresence mode="wait">
          {filteredOptions.map(opt => (
            <CodingOptionCard
              key={opt.did}
              option={opt}
              isRestricted={opt.isRestricted}
              dbNotes={opt.dbNotes}
              writeMode={writeMode}
              writeInProgress={writeInProgress}
              onSetPending={setPending}
              onApply={handleApply}
              onClearPending={clearPending}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {confirmDID !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4"
            onClick={() => setConfirmDID(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-card border border-border rounded-xl p-4 max-w-sm w-full space-y-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-chart-4" />
                <h3 className="text-sm font-bold text-foreground">{t.coding.confirmWrite}</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.coding.confirmWriteDesc} 0x{confirmDID.toString(16).toUpperCase()}. {t.coding.autoBackup}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirmDID(null)} className="flex-1 h-8 text-xs">{t.coding.cancel}</Button>
                <Button size="sm" variant="destructive" onClick={handleConfirm} className="flex-1 h-8 text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  {t.coding.confirmWrite}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last Write Result */}
      {lastWriteResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-lg border p-2 text-[10px] ${
            lastWriteResult.success
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          {lastWriteResult.success ? '✅' : '❌'} {lastWriteResult.message}
        </motion.div>
      )}

      {/* Backup History */}
      {backups.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[10px] font-medium text-muted-foreground">{t.coding.backupHistory}</h3>
          {backups.slice(-5).reverse().map(b => (
            <div key={b.id} className="bg-card rounded border border-border p-2 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-foreground">{b.didHex}</span>
                <span className="text-[9px] text-muted-foreground ml-1.5">{b.name}</span>
                <div className="text-[9px] text-muted-foreground">
                  {b.originalValue} → {b.newValue}
                  {b.rolledBack && <span className="text-chart-4 ml-1">({t.coding.rolledBack})</span>}
                </div>
              </div>
              {!b.rolledBack && (
                <Button size="sm" variant="ghost" onClick={() => rollback(b.id)} className="h-6 text-[9px]">
                  <Undo2 className="w-3 h-3 mr-0.5" />
                  {t.coding.undo}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CodingOptionCard({
  option: opt,
  isRestricted,
  dbNotes,
  writeMode,
  writeInProgress,
  onSetPending,
  onApply,
  onClearPending,
}: {
  option: CodingOption;
  isRestricted?: boolean;
  dbNotes?: string;
  writeMode: WriteMode;
  writeInProgress: boolean;
  onSetPending: (did: number, v: number) => void;
  onApply: (did: number, v: number) => void;
  onClearPending: (did: number) => void;
}) {
  const hasPending = opt.pendingValue !== null && opt.pendingValue !== opt.currentValue;
  const blocked = isRestricted || opt.isSecurityLocked;

  return (
    <motion.div
      layout
      className={`bg-card rounded-lg border p-2.5 transition-colors ${
        isRestricted ? 'border-chart-4/30 opacity-70' : opt.isSecurityLocked ? 'border-destructive/30 opacity-60' : hasPending ? 'border-chart-4/50' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <div className="text-[11px] font-semibold text-foreground">{opt.name}</div>
          <div className="text-[9px] text-muted-foreground">{opt.description}</div>
        </div>
        {isRestricted && (
          <Badge variant="outline" className="text-[8px] border-chart-4/50 text-chart-4">
            <Ban className="w-2.5 h-2.5 mr-0.5" /> {t.coding.pacificaRestricted}
          </Badge>
        )}
        {opt.isSecurityLocked && !isRestricted && (
          <Badge variant="destructive" className="text-[8px]">{t.coding.locked}</Badge>
        )}
        {opt.currentValue !== null && !blocked && (
          <Badge variant="outline" className="text-[9px] font-mono">
            {opt.options?.find(o => o.value === opt.currentValue)?.label ?? opt.currentValue}
          </Badge>
        )}
      </div>

      {/* DB Notes */}
      {dbNotes && (
        <p className="text-[9px] text-muted-foreground/70 italic mb-1">{dbNotes}</p>
      )}

      {!blocked && (
        <div className="space-y-1.5">
          {opt.controlType === 'toggle' && (
            <div className="flex gap-2">
              {[0, 1].map(v => (
                <button
                  key={v}
                  onClick={() => onSetPending(opt.did, v)}
                  className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-colors ${
                    (opt.pendingValue ?? opt.currentValue) === v
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {v === 0 ? t.coding.off : t.coding.on}
                </button>
              ))}
            </div>
          )}

          {opt.controlType === 'dropdown' && opt.options && (
            <div className="flex flex-wrap gap-1">
              {opt.options.map(o => (
                <button
                  key={o.value}
                  onClick={() => onSetPending(opt.did, o.value)}
                  className={`px-2 py-1 rounded text-[9px] font-medium transition-colors ${
                    (opt.pendingValue ?? opt.currentValue) === o.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {opt.controlType === 'slider' && (
            <div className="space-y-1">
              <input
                type="range"
                min={opt.min ?? 0}
                max={opt.max ?? 100}
                step={opt.step ?? 1}
                value={opt.pendingValue ?? opt.currentValue ?? 0}
                onChange={e => onSetPending(opt.did, Number(e.target.value))}
                className="w-full h-1.5 accent-primary"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>{opt.min ?? 0} {opt.unit}</span>
                <span className="font-mono text-foreground">{opt.pendingValue ?? opt.currentValue ?? 0} {opt.unit}</span>
                <span>{opt.max ?? 100} {opt.unit}</span>
              </div>
            </div>
          )}

          {hasPending && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex gap-1.5 pt-1">
              <Button
                size="sm"
                variant="default"
                onClick={() => onApply(opt.did, opt.pendingValue!)}
                disabled={writeInProgress}
                className="flex-1 h-7 text-[10px]"
              >
                {writeInProgress ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-0.5" />}
                {t.coding.apply}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onClearPending(opt.did)} className="h-7 text-[10px]">
                {t.coding.cancel}
              </Button>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}
