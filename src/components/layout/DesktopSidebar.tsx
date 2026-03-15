import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import TondaAvatar from "@/components/TondaAvatar";
import {
  Home, Wrench, Car, User, Search, ShoppingCart, AlertTriangle,
  BookOpen, Bell, Shield, FileText, Cpu, Activity, MessageCircle,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useState } from "react";

const mainNav = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/shop", label: "Katalog dílů", icon: Search },
  { path: "/epc", label: "EPC Diagramy", icon: Cpu },
  { path: "/my-vehicles", label: "Moje vozidla", icon: Car },
  { path: "/ai-mechanic", label: "AI Mechanik Tonda", icon: MessageCircle, isTonda: true },
  { path: "/obd", label: "OBD Diagnostika", icon: Activity },
];

const serviceNav = [
  { path: "/service", label: "Servis", icon: Wrench },
  { path: "/my-service-orders", label: "Zakázky", icon: FileText },
  { path: "/service-book", label: "Servisní knížka", icon: BookOpen },
  { path: "/service-plan", label: "Údržba", icon: FileText },
  { path: "/emergency", label: "SOS", icon: AlertTriangle },
];

const accountNav = [
  { path: "/cart", label: "Košík", icon: ShoppingCart },
  { path: "/orders", label: "Objednávky", icon: FileText },
  { path: "/notifications", label: "Notifikace", icon: Bell },
  { path: "/vehicles", label: "Vozy k prodeji", icon: Car },
  { path: "/vehicle-offer", label: "Výkup / Dovoz", icon: Car },
  { path: "/account", label: "Můj účet", icon: User },
];

const DesktopSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, employee } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (employee && employee.role !== "admin") return null;

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/" || location.pathname === "/index"
      : location.pathname.startsWith(path);

  const NavItem = ({ item }: { item: { path: string; label: string; icon: any; isTonda?: boolean } }) => (
    <button
      onClick={() => navigate(item.path)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 relative",
        isActive(item.path)
          ? "text-primary bg-primary/5"
          : "text-muted-foreground hover:text-foreground hover:bg-card/50"
      )}
      title={collapsed ? item.label : undefined}
    >
      {isActive(item.path) && (
        <div className="absolute left-0 w-[3px] h-5 rounded-r-full bg-primary" />
      )}
      {item.isTonda ? (
        <TondaAvatar size="nav" className="shrink-0" />
      ) : (
        <item.icon className="w-4 h-4 shrink-0" />
      )}
      {!collapsed && <span className="truncate font-light tracking-wide">{item.label}</span>}
    </button>
  );

  const NavSection = ({ title, items }: { title: string; items: { path: string; label: string; icon: any; isTonda?: boolean }[] }) => (
    <div className="space-y-0.5">
      {!collapsed && (
        <p className="px-3 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/40 font-medium mb-2">
          {title}
        </p>
      )}
      {items.map(item => (
        <NavItem key={item.path} item={item} />
      ))}
    </div>
  );

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-screen sticky top-0 border-r border-border/20 bg-sidebar-background transition-all duration-300 shrink-0",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="p-4 flex items-center gap-3 border-b border-border/20">
        <button onClick={() => navigate("/")} className="shrink-0">
          <img src="/images/logo-cd-pardubice.png" alt="Logo" className="h-9 object-contain" />
        </button>
        {!collapsed && (
          <span className="font-display font-semibold text-[11px] leading-tight truncate tracking-wide text-foreground/80">
            Chrysler&amp;Dodge
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-hide">
        <NavSection title="Hlavní" items={mainNav} />
        <NavSection title="Servis" items={serviceNav} />
        <NavSection title="Účet" items={accountNav} />
        {isAdmin && (
          <NavSection title="Admin" items={[{ path: "/admin", label: "Admin Panel", icon: Shield }]} />
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-border/20">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span className="tracking-wide">Sbalit</span></>}
        </button>
      </div>
    </aside>
  );
};

export default DesktopSidebar;
