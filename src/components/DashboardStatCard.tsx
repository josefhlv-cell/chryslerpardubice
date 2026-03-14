import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface DashboardStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: string;
  delay?: number;
}

const DashboardStatCard = ({ icon: Icon, label, value, trend, delay = 0 }: DashboardStatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="glass-card p-4 flex flex-col gap-2"
  >
    <div className="flex items-center justify-between">
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      {trend && (
        <span className="text-[10px] font-medium text-success">{trend}</span>
      )}
    </div>
    <div>
      <p className="text-xl font-display font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  </motion.div>
);

export default DashboardStatCard;
