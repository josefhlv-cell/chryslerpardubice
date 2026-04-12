import { PanelPacificaXRay } from './PanelPacificaXRay';
import { PanelTCXRay } from './PanelTCXRay';
import { PanelDiagIcons } from './PanelDiagIcons';
import { PanelMainDashboard } from './PanelMainDashboard';

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
