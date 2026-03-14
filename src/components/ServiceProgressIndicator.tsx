import { motion } from "framer-motion";
import { Package, Search, Wrench, FlaskConical, CheckCircle2 } from "lucide-react";

const STAGES = [
  { key: "received", label: "Přijato", icon: Package },
  { key: "diagnostics", label: "Diagnostika", icon: Search },
  { key: "in_repair", label: "Oprava", icon: Wrench },
  { key: "testing", label: "Test", icon: FlaskConical },
  { key: "completed", label: "Hotovo", icon: CheckCircle2 },
];

const STATUS_TO_STAGE: Record<string, number> = {
  received: 0,
  diagnostics: 1,
  waiting_approval: 1,
  waiting_parts: 2,
  in_repair: 2,
  testing: 3,
  ready_pickup: 4,
  completed: 4,
};

interface ServiceProgressIndicatorProps {
  status: string;
  compact?: boolean;
  className?: string;
}

const ServiceProgressIndicator = ({ status, compact = false, className = "" }: ServiceProgressIndicatorProps) => {
  const currentStage = STATUS_TO_STAGE[status] ?? 0;
  const progress = ((currentStage) / (STAGES.length - 1)) * 100;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
          {STAGES[currentStage]?.label}
        </span>
      </div>
    );
  }

  return (
    <div className={`glass-card p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const isCompleted = i < currentStage;
          const isCurrent = i === currentStage;
          const isFuture = i > currentStage;

          return (
            <div key={stage.key} className="flex flex-col items-center gap-1.5 flex-1 relative">
              {/* Connector line */}
              {i > 0 && (
                <div className="absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 z-0">
                  <div className={`h-full rounded-full transition-colors duration-500 ${
                    isCompleted || isCurrent ? "bg-primary" : "bg-secondary"
                  }`} />
                </div>
              )}

              {/* Icon circle */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                    ? "bg-primary/20 text-primary border-2 border-primary glow-primary"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {isCurrent && (
                  <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-20" />
                )}
              </motion.div>

              <span className={`text-[9px] font-medium text-center leading-tight ${
                isCurrent ? "text-primary" : isFuture ? "text-muted-foreground/50" : "text-muted-foreground"
              }`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ServiceProgressIndicator;
