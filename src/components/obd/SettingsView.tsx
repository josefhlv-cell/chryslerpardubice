import { motion } from 'framer-motion';
import { Sliders, Sun, Moon, Palette, Layout, Monitor } from 'lucide-react';
import { elm327 } from '@/lib/elm327-engine';
import { useTheme, type ColorMode, type DashboardTheme, type LayoutMode } from '@/hooks/use-theme';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { t } from '@/lib/i18n';

type Props = {
  commandDelay: number;
  onDelayChange: (ms: number) => void;
};

const THEME_OPTIONS: { id: DashboardTheme; label: string; description: string; preview: string[] }[] = [
  { id: 'default', label: 'Default', description: 'Amber & Cyan', preview: ['38 95% 55%', '185 70% 45%'] },
  { id: 'metal', label: 'Metal', description: 'Brushed steel', preview: ['210 15% 65%', '210 20% 72%'] },
  { id: 'carbon', label: 'Carbon', description: 'Racing red', preview: ['0 85% 55%', '0 75% 60%'] },
  { id: 'neon', label: 'Neon', description: 'Cyberpunk glow', preview: ['160 100% 50%', '280 100% 65%'] },
];

export function SettingsView({ commandDelay, onDelayChange }: Props) {
  const { colorMode, dashboardTheme, layoutMode, setColorMode, setDashboardTheme, setLayoutMode, toggleColorMode } = useTheme();

  const handleDelayChange = (value: number) => {
    onDelayChange(value);
    elm327.setCommandDelay(value);
  };

  return (
    <div className="flex flex-col gap-5 p-4 pb-20">
      <h2 className="text-sm font-semibold text-foreground">{t.settings.title}</h2>

      {/* ─── Appearance ─── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Sun className="w-3.5 h-3.5 text-primary" />
          <span className="text-label">{t.settings.appearance}</span>
        </div>

        {/* Dark / Light Toggle */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {colorMode === 'dark' ? (
                  <Moon className="w-5 h-5 text-primary" />
                ) : (
                  <Sun className="w-5 h-5 text-primary" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {colorMode === 'dark' ? t.settings.darkMode : t.settings.lightMode}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {colorMode === 'dark' ? t.settings.darkModeDesc : t.settings.lightModeDesc}
                  </p>
                </div>
              </div>
              <Switch
                checked={colorMode === 'light'}
                onCheckedChange={() => toggleColorMode()}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── Dashboard Theme ─── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Palette className="w-3.5 h-3.5 text-primary" />
          <span className="text-label">{t.settings.dashboardTheme}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {THEME_OPTIONS.map(theme => {
            const active = dashboardTheme === theme.id;
            return (
              <motion.button
                key={theme.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => setDashboardTheme(theme.id)}
                className={`relative p-3 rounded-xl border text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:border-muted-foreground/30'
                }`}
              >
                {/* Color preview dots */}
                <div className="flex gap-1.5 mb-2">
                  {theme.preview.map((hsl, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${hsl})` }}
                    />
                  ))}
                </div>
                <p className="text-xs font-semibold text-foreground">{theme.label}</p>
                <p className="text-[10px] text-muted-foreground">{theme.description}</p>
                {active && (
                  <motion.div
                    layoutId="themeCheck"
                    className="absolute top-2 right-2"
                  >
                    <Badge variant="default" className="text-[8px] px-1.5 py-0">{t.settings.active}</Badge>
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ─── Layout Mode ─── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Layout className="w-3.5 h-3.5 text-primary" />
          <span className="text-label">{t.settings.layoutMode}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([
            { id: 'normal' as LayoutMode, label: t.settings.normal, desc: t.settings.normalDesc, tabs: t.settings.tabs8 },
            { id: 'pro' as LayoutMode, label: t.settings.pro, desc: t.settings.proDesc, tabs: t.settings.allTabs },
          ]).map(mode => {
            const active = layoutMode === mode.id;
            return (
              <motion.button
                key={mode.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => setLayoutMode(mode.id)}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:border-muted-foreground/30'
                }`}
              >
                <p className="text-xs font-semibold text-foreground">{mode.label}</p>
                <p className="text-[10px] text-muted-foreground">{mode.desc}</p>
                <Badge variant="secondary" className="text-[8px] mt-1.5">{mode.tabs}</Badge>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ─── Command Delay ─── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Sliders className="w-3.5 h-3.5 text-primary" />
          <span className="text-label">{t.settings.performance}</span>
        </div>

        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{t.settings.commandDelay}</span>
              <span className="font-mono text-sm text-accent">{commandDelay}ms</span>
            </div>
            <input
              type="range"
              min={50}
              max={120}
              value={commandDelay}
              onChange={e => handleDelayChange(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>50ms ({t.settings.fast})</span>
              <span>120ms ({t.settings.stable})</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── Info Cards ─── */}
      <section className="space-y-2">
        <span className="text-label px-1">{t.settings.protocolInfo}</span>
        <Card>
          <CardContent className="p-4 space-y-2">
            <InfoRow label={t.settings.transport} value="ISO-TP (ISO 15765-2)" />
            <InfoRow label={t.settings.initSequence} value="ATZ → ATST64" />
            <InfoRow label={t.settings.headerMode} value="ATH1" />
            <InfoRow label={t.settings.protocol} value="Auto (ATSP0)" />
            <InfoRow label={t.settings.responseTimeout} value="ATST64 (400ms)" />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <span className="text-label px-1">{t.settings.targetVehicle}</span>
        <Card>
          <CardContent className="p-4 space-y-2">
            <InfoRow label={t.settings.make} value="Chrysler" />
            <InfoRow label={t.settings.model} value="Town & Country / Pacifica" />
            <InfoRow label={t.settings.adapter} value="Vgate iCar Pro 4.0" />
            <InfoRow label={t.settings.interface} value="BLE (Bluetooth Low Energy)" />
          </CardContent>
        </Card>
      </section>

      {/* Version */}
      <div className="text-center py-4">
        <p className="text-[10px] text-muted-foreground font-mono">CHDP OBD 4.0</p>
        <p className="text-[10px] text-muted-foreground">{t.settings.builtFor}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}
