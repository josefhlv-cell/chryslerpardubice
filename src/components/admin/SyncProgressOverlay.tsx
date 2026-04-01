import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export interface SyncStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

interface SyncProgressOverlayProps {
  visible: boolean;
  title: string;
  steps: SyncStep[];
  percent: number;
  summary?: string;
  error?: string;
}

const SyncProgressOverlay = ({ visible, title, steps, percent, summary, error }: SyncProgressOverlayProps) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-xl border border-border bg-card p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            {error ? (
              <XCircle className="w-4 h-4 text-destructive shrink-0" />
            ) : percent >= 100 ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            )}
            <span className="text-sm font-semibold">{title}</span>
            <span className="ml-auto text-xs font-mono text-muted-foreground">{Math.round(percent)} %</span>
          </div>

          <Progress value={percent} className="h-2" />

          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {step.status === "active" && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />}
                {step.status === "done" && <CheckCircle2 className="w-3 h-3 text-success shrink-0" />}
                {step.status === "error" && <XCircle className="w-3 h-3 text-destructive shrink-0" />}
                {step.status === "pending" && <div className="w-3 h-3 rounded-full border border-muted-foreground/30 shrink-0" />}
                <span className={step.status === "active" ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {summary && (
            <p className="text-xs text-muted-foreground border-t border-border pt-2">{summary}</p>
          )}
          {error && (
            <p className="text-xs text-destructive border-t border-border pt-2">{error}</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SyncProgressOverlay;
