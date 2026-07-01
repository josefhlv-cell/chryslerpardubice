/**
 * AdminShell — sidebar navigace se stromem pro admin panel.
 * Nahrazuje horizontální Tabs. Aktivní sekce se ukládá do URL hash.
 */
import { ReactNode, useEffect, useState } from "react";
import { ChevronRight, ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type AdminTreeNode = {
  key: string;
  label: string;
  icon?: any;
  badge?: number;
  children?: AdminTreeNode[];
  hidden?: boolean;
};

interface Props {
  tree: AdminTreeNode[];
  activeKey: string;
  onSelect: (key: string) => void;
  children: ReactNode;
}

const STORAGE_KEY = "admin:expanded-groups";

const AdminShell = ({ tree, activeKey, onSelect, children }: Props) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  // auto-expand parent of active key
  useEffect(() => {
    const findParent = (nodes: AdminTreeNode[], parent: string | null): string | null => {
      for (const n of nodes) {
        if (n.key === activeKey) return parent;
        if (n.children) {
          const r = findParent(n.children, n.key);
          if (r !== null) return r;
        }
      }
      return null;
    };
    const parent = findParent(tree, null);
    if (parent) setExpanded((e) => ({ ...e, [parent]: true }));
  }, [activeKey, tree]);

  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const renderNode = (node: AdminTreeNode, depth = 0) => {
    if (node.hidden) return null;
    const hasChildren = !!node.children?.length;
    const isActive = activeKey === node.key;
    const isOpen = expanded[node.key] ?? depth === 0;
    const Icon = node.icon;

    return (
      <div key={node.key}>
        <button
          onClick={() => {
            if (hasChildren) toggle(node.key);
            else {
              onSelect(node.key);
              setMobileOpen(false);
            }
          }}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors text-left",
            "hover:bg-amber-500/10",
            isActive && !hasChildren && "bg-amber-500/15 text-amber-300 font-medium",
            depth === 0 && "font-medium",
          )}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {hasChildren ? (
            isOpen ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
          ) : (
            <span className="w-3 h-3 shrink-0" />
          )}
          {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate flex-1">{node.label}</span>
          {node.badge !== undefined && node.badge > 0 && (
            <span className="ml-auto min-w-[18px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
              {node.badge > 99 ? "99+" : node.badge}
            </span>
          )}
        </button>
        {hasChildren && isOpen && (
          <div className="mt-0.5 space-y-0.5">
            {node.children!.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex w-full min-h-[calc(100vh-3.5rem)]">
      {/* Mobile menu button */}
      <Button
        variant="outline"
        size="sm"
        className="lg:hidden fixed bottom-20 right-4 z-40 shadow-lg"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="w-4 h-4 mr-1" /> Sekce
      </Button>

      {/* Sidebar */}
      <aside
        className={cn(
          "shrink-0 border-r border-border/20 bg-card/30 backdrop-blur",
          "lg:w-[240px] lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)]",
          mobileOpen
            ? "fixed inset-0 z-50 w-[280px] h-screen overflow-y-auto"
            : "hidden lg:block",
        )}
      >
        <div className="lg:hidden flex items-center justify-between p-3 border-b border-border/20">
          <span className="text-sm font-semibold">Admin</span>
          <button onClick={() => setMobileOpen(false)} className="p-1 rounded hover:bg-card">
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="p-2 space-y-0.5 overflow-y-auto h-full">
          {tree.map((n) => renderNode(n))}
        </nav>
      </aside>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Content */}
      <main className="flex-1 min-w-0 p-3 lg:p-4 pb-32 lg:pb-8 overflow-x-hidden">{children}</main>
    </div>
  );
};

export default AdminShell;
