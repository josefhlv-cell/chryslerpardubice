import { ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CollapsibleAdminSectionProps {
  title: string;
  count?: number;
  icon?: ReactNode;
  defaultOpen?: boolean;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

/**
 * Collapsible wrapper used by every admin list.
 * Per spec: **always collapsed on page load** (no persistence).
 * User expands manually so the admin dashboard doesn't overflow.
 */
export function CollapsibleAdminSection({
  title,
  count,
  icon,
  defaultOpen = false,
  description,
  children,
  className,
  actions,
}: CollapsibleAdminSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        {icon && <div className="text-primary shrink-0">{icon}</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{title}</span>
            {typeof count === "number" && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {count}
              </Badge>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border/40 p-3 space-y-2 bg-background/50">
          {children}
        </div>
      )}
    </Card>
  );
}

export default CollapsibleAdminSection;
