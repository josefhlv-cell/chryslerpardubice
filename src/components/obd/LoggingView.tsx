import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Square, Trash2, Download, FileJson, FileSpreadsheet,
  Clock, Tag, ChevronDown, ChevronRight, SkipBack, SkipForward,
  Pause, Zap, AlertTriangle, Database
} from 'lucide-react';
import { useDataLogger } from '@/hooks/use-data-logger';
import type { LogSession, LogEntry, LogTag } from '@/lib/data-logger';

type Props = { elmReady: boolean };

const TAG_STYLES: Record<LogTag, { bg: string; text: string }> = {
  'live': { bg: 'bg-success/20', text: 'text-success' },
  'static': { bg: 'bg-muted', text: 'text-muted-foreground' },
  'high-variance': { bg: 'bg-warning/20', text: 'text-warning' },
  'warning': { bg: 'bg-destructive/20', text: 'text-destructive' },
  'chrysler-ext': { bg: 'bg-primary/20', text: 'text-primary' },
  'anomaly': { bg: 'bg-destructive/20', text: 'text-destructive' },
  'flag': { bg: 'bg-accent/20', text: 'text-accent' },
};

export function LoggingView({ elmReady }: Props) {
  const {
    sessions, active, replay,
    startSession, endSession, deleteSession,
    exportCSV, exportJSON,
    startReplay, stopReplay, seekReplay, setReplaySpeed,
  } = useDataLogger();
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [view, setView] = useState<'sessions' | 'replay'>('sessions');

  if (!elmReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="w-20 h-20 rounded-2xl bg-card border border-border flex items-center justify-center">
          <Database className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Initialize ELM327 to start logging
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 pb-2">
      {/* Record Controls */}
      <div className="flex gap-2">
        <motion.button
          onClick={() => active ? endSession() : startSession()}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm ${
            active
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-primary text-primary-foreground'
          }`}
          whileTap={{ scale: 0.98 }}
        >
          {active ? (
            <><Square className="w-4 h-4 fill-current" /><span>Stop Recording</span></>
          ) : (
            <><div className="w-3 h-3 rounded-full bg-destructive animate-pulse" /><span>Record Session</span></>
          )}
        </motion.button>
        <button
          onClick={() => setView(view === 'sessions' ? 'replay' : 'sessions')}
          className={`p-3 rounded-xl border ${view === 'replay' ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'}`}
        >
          <Play className={`w-4 h-4 ${view === 'replay' ? 'text-primary' : 'text-muted-foreground'}`} />
        </button>
      </div>

      {/* Active Session Stats */}
      {active && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20"
        >
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <div className="flex-1">
            <span className="text-xs font-semibold text-foreground">{active.name}</span>
            <span className="text-[10px] text-muted-foreground ml-2">
              {active.entries.length} entries · {((Date.now() - active.startTime) / 1000).toFixed(0)}s
            </span>
          </div>
        </motion.div>
      )}

      {/* View Toggle */}
      <AnimatePresence mode="wait">
        {view === 'sessions' ? (
          <motion.div key="sessions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SessionList
              sessions={sessions}
              expandedSession={expandedSession}
              onToggle={id => setExpandedSession(expandedSession === id ? null : id)}
              onDelete={deleteSession}
              onExportCSV={exportCSV}
              onExportJSON={exportJSON}
              onReplay={id => { startReplay(id); setView('replay'); }}
            />
          </motion.div>
        ) : (
          <motion.div key="replay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReplayPanel
              replay={replay}
              sessions={sessions}
              onStop={stopReplay}
              onSeek={seekReplay}
              onSpeedChange={setReplaySpeed}
              onStartReplay={startReplay}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Session List ---------- */

function SessionList({
  sessions, expandedSession, onToggle, onDelete, onExportCSV, onExportJSON, onReplay,
}: {
  sessions: LogSession[];
  expandedSession: string | null;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onExportCSV: (id: string) => void;
  onExportJSON: (id: string) => void;
  onReplay: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8">
        No recorded sessions yet. Start recording to capture data.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
      {sessions.map(session => (
        <div key={session.id} className="rounded-lg bg-card border border-border overflow-hidden">
          <button
            onClick={() => onToggle(session.id)}
            className="flex items-center justify-between w-full px-3 py-2.5 active:bg-muted"
          >
            <div className="flex items-center gap-2 text-left">
              <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <div>
                <span className="text-xs font-semibold text-foreground block">{session.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(session.startTime).toLocaleDateString()} · {session.entries.length} entries
                  {session.endTime && ` · ${((session.endTime - session.startTime) / 1000).toFixed(0)}s`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {session.metadata.tagSummary['high-variance'] > 0 && (
                <AlertTriangle className="w-3 h-3 text-warning" />
              )}
              {session.metadata.tagSummary['chrysler-ext'] > 0 && (
                <Zap className="w-3 h-3 text-primary" />
              )}
              {expandedSession === session.id ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </div>
          </button>

          <AnimatePresence>
            {expandedSession === session.id && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                  {/* Tag Summary */}
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(session.metadata.tagSummary).map(([tag, count]) =>
                      count > 0 ? (
                        <span
                          key={tag}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                            TAG_STYLES[tag as LogTag]?.bg || 'bg-muted'
                          } ${TAG_STYLES[tag as LogTag]?.text || 'text-muted-foreground'}`}
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {tag}: {count}
                        </span>
                      ) : null
                    )}
                  </div>

                  {/* DIDs */}
                  <div>
                    <span className="text-[10px] text-muted-foreground">Unique DIDs: {session.metadata.didCount}</span>
                  </div>

                  {/* Recent entries preview */}
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {session.entries.slice(-8).map((entry, i) => (
                      <EntryRow key={i} entry={entry} />
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-1">
                    <ActionBtn icon={Play} label="Replay" onClick={() => onReplay(session.id)} accent />
                    <ActionBtn icon={FileSpreadsheet} label="CSV" onClick={() => onExportCSV(session.id)} />
                    <ActionBtn icon={FileJson} label="JSON" onClick={() => onExportJSON(session.id)} />
                    <ActionBtn icon={Trash2} label="Delete" onClick={() => onDelete(session.id)} destructive />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

/* ---------- Replay Panel ---------- */

function ReplayPanel({
  replay, sessions, onStop, onSeek, onSpeedChange, onStartReplay,
}: {
  replay: { running: boolean; sessionId: string | null; index: number; speed: number; currentEntry: any };
  sessions: LogSession[];
  onStop: () => void;
  onSeek: (i: number) => void;
  onSpeedChange: (s: number) => void;
  onStartReplay: (id: string, speed?: number) => void;
}) {
  const session = sessions.find(s => s.id === replay.sessionId);

  if (!session) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground text-center py-4">Select a session to replay</p>
        <div className="space-y-1">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => onStartReplay(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border active:bg-muted text-left"
            >
              <Play className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-foreground">{s.name}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{s.entries.length} entries</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const progress = session.entries.length > 0 ? (replay.index / (session.entries.length - 1)) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Replay Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{session.name}</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {replay.index + 1}/{session.entries.length}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-primary rounded-full"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Timeline slider */}
      <input
        type="range"
        min={0}
        max={Math.max(0, session.entries.length - 1)}
        value={replay.index}
        onChange={e => onSeek(parseInt(e.target.value))}
        className="w-full h-1 accent-primary"
      />

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => onSeek(Math.max(0, replay.index - 10))} className="p-2 rounded-lg bg-card border border-border active:bg-muted">
          <SkipBack className="w-4 h-4 text-muted-foreground" />
        </button>
        <motion.button
          onClick={() => replay.running ? onStop() : onStartReplay(session.id, replay.speed)}
          className="p-3 rounded-xl bg-primary text-primary-foreground"
          whileTap={{ scale: 0.95 }}
        >
          {replay.running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
        </motion.button>
        <button onClick={() => onSeek(Math.min(session.entries.length - 1, replay.index + 10))} className="p-2 rounded-lg bg-card border border-border active:bg-muted">
          <SkipForward className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Speed */}
      <div className="flex justify-center gap-1">
        {[0.5, 1, 2, 4].map(s => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-1 rounded text-[10px] font-mono ${
              replay.speed === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Current Entry */}
      {replay.currentEntry && (
        <motion.div
          key={replay.index}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl bg-card border border-border"
        >
          <EntryRow entry={replay.currentEntry} expanded />
        </motion.div>
      )}

      {/* Scrolling entries around current */}
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {session.entries.slice(Math.max(0, replay.index - 3), replay.index + 5).map((entry, i) => {
          const realIdx = Math.max(0, replay.index - 3) + i;
          return (
            <button key={realIdx} onClick={() => onSeek(realIdx)} className="w-full text-left">
              <EntryRow entry={entry} highlight={realIdx === replay.index} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Shared Components ---------- */

function EntryRow({ entry, expanded, highlight }: { entry: LogEntry; expanded?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] font-mono ${
      highlight ? 'bg-primary/10 border border-primary/30' : ''
    }`}>
      <span className="text-muted-foreground w-14 flex-shrink-0">
        {new Date(entry.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="text-accent w-10 flex-shrink-0">{entry.did}</span>
      <span className="text-foreground truncate flex-1">
        {expanded ? `${entry.label}: ${String(entry.decoded)}` : String(entry.decoded)}
      </span>
      <div className="flex gap-0.5 flex-shrink-0">
        {entry.tags.slice(0, 2).map(tag => (
          <span key={tag} className={`px-1 py-0 rounded text-[8px] ${TAG_STYLES[tag]?.bg || 'bg-muted'} ${TAG_STYLES[tag]?.text || 'text-muted-foreground'}`}>
            {tag.replace('chrysler-ext', 'CHR').replace('high-variance', 'HV')}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, accent, destructive }: {
  icon: typeof Play; label: string; onClick: () => void; accent?: boolean; destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium border active:scale-95 transition-transform ${
        accent
          ? 'bg-primary/10 border-primary/30 text-primary'
          : destructive
          ? 'bg-destructive/10 border-destructive/30 text-destructive'
          : 'bg-card border-border text-muted-foreground'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}
