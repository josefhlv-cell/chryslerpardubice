import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Trash2 } from 'lucide-react';
import { t } from '@/lib/obd/i18n';

type LogEntry = {
  type: 'tx' | 'rx' | 'error' | 'info';
  message: string;
  timestamp: number;
};

type Props = {
  onSend: (command: string) => Promise<string>;
  elmReady: boolean;
};

export function TerminalView({ onSend, elmReady }: Props) {
  const [input, setInput] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);

  const addLog = (type: LogEntry['type'], message: string) => {
    setLog(prev => [...prev, { type, message, timestamp: Date.now() }].slice(-100));
  };

  const handleSend = async () => {
    if (!input.trim() || !elmReady) return;
    const cmd = input.trim().toUpperCase();
    setInput('');
    addLog('tx', cmd);

    try {
      const response = await onSend(cmd);
      addLog('rx', response);
    } catch (e: any) {
      addLog('error', e.message || 'Command failed');
    }
  };

  const getColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'tx': return 'text-primary';
      case 'rx': return 'text-accent';
      case 'error': return 'text-destructive';
      case 'info': return 'text-muted-foreground';
    }
  };

  const getPrefix = (type: LogEntry['type']) => {
    switch (type) {
      case 'tx': return '>';
      case 'rx': return '<';
      case 'error': return '!';
      case 'info': return '#';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Log Output */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 carbon-bg">
        {log.length === 0 && (
          <p className="text-xs text-muted-foreground font-mono py-4 text-center">
            {elmReady ? t.terminal.ready : t.terminal.initFirst}
          </p>
        )}
        {log.map((entry, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`font-mono text-xs ${getColor(entry.type)}`}
          >
            <span className="opacity-40 mr-1">
              {new Date(entry.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="mr-1">{getPrefix(entry.type)}</span>
            <span>{entry.message}</span>
          </motion.div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 bg-card border-t border-border safe-bottom">
        <button
          onClick={() => setLog([])}
          className="p-2 text-muted-foreground active:text-foreground"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={elmReady ? t.terminal.placeholder : t.terminal.notConnected}
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
