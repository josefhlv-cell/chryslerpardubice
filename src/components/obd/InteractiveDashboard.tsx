import { useState, useCallback, useMemo } from 'react';
import { motion, Reorder } from 'framer-motion';
import { GripVertical, Plus, X, Settings2, RotateCcw } from 'lucide-react';
import { RadialGauge, DataCard, BarGauge } from './Gauge';
import { Engine3D } from './Engine3D';
import { LiveData } from '@/hooks/use-obd';

type WidgetType = 'radial' | 'bar' | 'card' | 'engine3d';

type Widget = {
  id: string;
  type: WidgetType;
  pid: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  span?: 'full' | 'half';
};

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'rpm', type: 'radial', pid: '010C', label: 'RPM', unit: 'rpm', min: 0, max: 8000, span: 'half' },
  { id: 'speed', type: 'radial', pid: '010D', label: 'Speed', unit: 'km/h', min: 0, max: 255, span: 'half' },
  { id: 'engine3d', type: 'engine3d', pid: '', label: '3D Engine', unit: '', min: 0, max: 0, span: 'full' },
  { id: 'coolant', type: 'bar', pid: '0105', label: 'Coolant', unit: '°C', min: -40, max: 215, span: 'half' },
  { id: 'throttle', type: 'bar', pid: '0111', label: 'Throttle', unit: '%', min: 0, max: 100, span: 'half' },
  { id: 'voltage', type: 'card', pid: '0142', label: 'Battery', unit: 'V', min: 0, max: 16, span: 'half' },
  { id: 'load', type: 'bar', pid: '0104', label: 'Engine Load', unit: '%', min: 0, max: 100, span: 'half' },
];

const AVAILABLE_PIDS: { pid: string; label: string; unit: string; min: number; max: number }[] = [
  { pid: '010C', label: 'RPM', unit: 'rpm', min: 0, max: 8000 },
  { pid: '010D', label: 'Speed', unit: 'km/h', min: 0, max: 255 },
  { pid: '0105', label: 'Coolant', unit: '°C', min: -40, max: 215 },
  { pid: '0111', label: 'Throttle', unit: '%', min: 0, max: 100 },
  { pid: '0142', label: 'Battery', unit: 'V', min: 0, max: 16 },
  { pid: '0104', label: 'Engine Load', unit: '%', min: 0, max: 100 },
  { pid: '010B', label: 'MAP', unit: 'kPa', min: 0, max: 255 },
  { pid: '010F', label: 'Intake Temp', unit: '°C', min: -40, max: 215 },
  { pid: '0110', label: 'MAF', unit: 'g/s', min: 0, max: 655 },
  { pid: '012F', label: 'Fuel Level', unit: '%', min: 0, max: 100 },
  { pid: '0146', label: 'Ambient Temp', unit: '°C', min: -40, max: 215 },
];

type Props = {
  data: LiveData;
  active: boolean;
  discoveredDIDs?: string[];
};

export function InteractiveDashboard({ data, active, discoveredDIDs }: Props) {
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [editMode, setEditMode] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Add discovered DIDs as available widgets
  const dynamicPids = useMemo(() => {
    if (!discoveredDIDs) return AVAILABLE_PIDS;
    const existing = new Set(AVAILABLE_PIDS.map(p => p.pid));
    const extra = discoveredDIDs
      .filter(d => !existing.has(d))
      .map(did => ({
        pid: did,
        label: `DID ${did}`,
        unit: '',
        min: 0,
        max: 65535,
      }));
    return [...AVAILABLE_PIDS, ...extra];
  }, [discoveredDIDs]);

  const handleRemove = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  }, []);

  const handleAdd = useCallback((pid: string, type: WidgetType) => {
    const pidInfo = dynamicPids.find(p => p.pid === pid);
    if (!pidInfo) return;
    const newWidget: Widget = {
      id: `${pid}-${Date.now()}`,
      type,
      pid,
      label: pidInfo.label,
      unit: pidInfo.unit,
      min: pidInfo.min,
      max: pidInfo.max,
      span: type === 'radial' || type === 'engine3d' ? 'half' : 'half',
    };
    setWidgets(prev => [...prev, newWidget]);
    setShowAddPanel(false);
  }, [dynamicPids]);

  const handleReset = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
  }, []);

  // Demo data when not connected
  const demoData: LiveData = useMemo(() => {
    if (active) return data;
    const now = Date.now();
    return {
      '010C': { value: 850, raw: '', timestamp: now },
      '010D': { value: 0, raw: '', timestamp: now },
      '0105': { value: 72, raw: '', timestamp: now },
      '0111': { value: 12, raw: '', timestamp: now },
      '0142': { value: 12.6, raw: '', timestamp: now },
      '0104': { value: 18, raw: '', timestamp: now },
    };
  }, [active, data]);

  const isDemo = !active;
  const effectiveData = isDemo ? demoData : data;

  const rpm = effectiveData['010C']?.value ?? 0;
  const coolant = effectiveData['0105']?.value ?? 0;
  const load = effectiveData['0104']?.value ?? 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Demo banner */}
      {isDemo && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border">
          <span className="text-amber-400 text-sm">⚡</span>
          <span className="text-[10px] text-muted-foreground font-mono">DEMO REŽIM — připojte OBD2 pro živá data</span>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isDemo ? 'bg-amber-400' : 'bg-success'} animate-pulse`} />
          <span className="text-label">{Object.keys(effectiveData).length} PIDs • {widgets.length} widgetů</span>
        </div>
        <div className="flex gap-1">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowAddPanel(!showAddPanel)}
            className={`p-1.5 rounded-md border border-border ${showAddPanel ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
          >
            <Plus className="w-4 h-4" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setEditMode(!editMode)}
            className={`p-1.5 rounded-md border border-border ${editMode ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
          >
            <Settings2 className="w-4 h-4" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleReset}
            className="p-1.5 rounded-md border border-border bg-card text-muted-foreground"
          >
            <RotateCcw className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* Add Widget Panel */}
      {showAddPanel && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="rounded-lg border border-border bg-card p-3 overflow-hidden"
        >
          <span className="text-label block mb-2">Add Widget</span>
          <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto">
            {dynamicPids.map(p => (
              <div key={p.pid} className="flex items-center gap-1">
                <button
                  onClick={() => handleAdd(p.pid, 'radial')}
                  className="flex-1 text-left text-xs font-mono px-2 py-1.5 rounded border border-border bg-muted hover:bg-accent hover:text-accent-foreground transition-colors truncate"
                >
                  {p.label}
                </button>
                <select
                  className="text-[10px] bg-muted border border-border rounded px-1 py-1 text-foreground"
                  onChange={(e) => {
                    if (e.target.value) handleAdd(p.pid, e.target.value as WidgetType);
                    e.target.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Type</option>
                  <option value="radial">Gauge</option>
                  <option value="bar">Bar</option>
                  <option value="card">Card</option>
                </select>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Widget Grid with Reorder */}
      <Reorder.Group
        axis="y"
        values={widgets}
        onReorder={setWidgets}
        className="grid grid-cols-2 gap-2"
        style={{ display: 'grid' }}
      >
        {widgets.map(widget => (
          <Reorder.Item
            key={widget.id}
            value={widget}
            dragListener={editMode}
            className={widget.span === 'full' ? 'col-span-2' : 'col-span-1'}
          >
            <div className="relative">
              {editMode && (
                <div className="absolute -top-1 -right-1 z-10 flex gap-0.5">
                  <button
                    onClick={() => handleRemove(widget.id)}
                    className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {editMode && (
                <div className="absolute top-1 left-1 z-10">
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
              <WidgetRenderer widget={widget} data={effectiveData} rpm={rpm} coolant={coolant} load={load} editMode={editMode} />
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}

function WidgetRenderer({ widget, data, rpm, coolant, load, editMode }: {
  widget: Widget;
  data: LiveData;
  rpm: number;
  coolant: number;
  load: number;
  editMode: boolean;
}) {
  const val = data[widget.pid]?.value ?? 0;
  const isLive = widget.pid in data;

  switch (widget.type) {
    case 'engine3d':
      return <Engine3D rpm={rpm} coolant={coolant} load={load} active={true} />;
    case 'radial':
      return (
        <div className={`flex justify-center py-2 rounded-lg border border-border bg-card ${editMode ? 'ring-1 ring-primary/30' : ''}`}>
          <RadialGauge
            value={val}
            min={widget.min}
            max={widget.max}
            label={widget.label}
            unit={widget.unit}
            size="md"
          />
        </div>
      );
    case 'bar':
      return (
        <div className={editMode ? 'ring-1 ring-primary/30 rounded-lg' : ''}>
          <BarGauge value={val} min={widget.min} max={widget.max} label={widget.label} unit={widget.unit} />
        </div>
      );
    case 'card':
      return (
        <div className={editMode ? 'ring-1 ring-primary/30 rounded-lg' : ''}>
          <DataCard
            label={widget.label}
            value={typeof val === 'number' ? (val % 1 !== 0 ? val.toFixed(1) : Math.round(val)) : val}
            unit={widget.unit}
            highlight={isLive}
          />
        </div>
      );
    default:
      return null;
  }
}
