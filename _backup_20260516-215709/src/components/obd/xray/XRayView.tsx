import { PanelPacificaXRay } from '@/components/obd/xray/PanelPacificaXRay';
import { PanelTCXRay } from '@/components/obd/xray/PanelTCXRay';
import { PanelDiagIcons } from '@/components/obd/xray/PanelDiagIcons';
import { PanelMainDashboard } from '@/components/obd/xray/PanelMainDashboard';

export function XRayView() {
  return (
    <div className="space-y-1 pb-4 hex-overlay">
      <PanelPacificaXRay />
      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent" />
      <PanelTCXRay />
      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent" />
      <PanelDiagIcons />
      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent" />
      <PanelMainDashboard />
    </div>
  );
}
