import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import TondaAvatar from "@/components/TondaAvatar";
import {
  Home,
  Wrench,
  Car,
  User,
  Search,
  ShoppingCart,
  AlertTriangle,
  BookOpen,
  Bell,
  Shield,
  FileText,
  Cpu,
  Activity,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

const mainNav = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/shop", label: "Katalog dílů", icon: Search },
  { path: "/epc", label: "EPC Diagramy", icon: Cpu },
  { path: "/my-vehicles", label: "Moje vozidla", icon: Car },
  { path: "/ai-mechanic", label: "AI Mechanik Tonda", icon: MessageCircle, isTonda: true },
  { path: "/obd", label: "OBD Diagnostika", icon: Activity },
];

const serviceNav = [
  { path: "/service", label: "Rezervace servisu", icon: Wrench },
  { path: "/my-service-orders", label: "Servisní zakázky", icon: FileText },
  { path: "/service-book", label: "Servisní knížka", icon: BookOpen },
  { path: "/service-plan", label: "Plán údržby", icon: FileText },
  { path: "/emergency", label: "Nouzový režim", icon: AlertTriangle },
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

  // Hide for employee roles
  if (employee && employee.role !== "admin") return null;

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/" || location.pathname === "/index"
      : location.pathname.startsWith(path);

  const NavItem = ({ item }: { item: typeof mainNav[0] & { isTonda?: boolean } }) => (
    <button
      onClick={() => navigate(item.path)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
        isActive(item.path)
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      )}
      title={collapsed ? item.label : undefined}
    >
      {item.isTonda ? (
        <TondaAvatar size="nav" className="shrink-0" />
      ) : (
        <item.icon className={cn("w-4.5 h-4.5 shrink-0", isActive(item.path) && "text-primary")} />
      )}
      {!collapsed && <span className="truncate">{item.label}</span>}
      {isActive(item.path) && !collapsed && (
        <motion.div layoutId="sidebar-active" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
      )}
    </button>
  );

  const NavSection = ({ title, items }: { title: string; items: typeof mainNav }) => (
    <div className="space-y-1">
      {!collapsed && (
        <p className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-2">
          {title}
        </p>
      )}
      {items.map(item => <NavItem key={item.path} item={item} />)}
    </div>
  );

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-screen sticky top-0 border-r border-border/40 bg-sidebar transition-all duration-300 shrink-0",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <div className="p-4 flex items-center gap-3 border-b border-border/40">
        <button onClick={() => navigate("/")} className="shrink-0">
          <img src="/images/logo-cd-pardubice.png" alt="Logo" className="h-10 object-contain" />
        </button>
        {!collapsed && (
          <span className="font-display font-bold text-xs leading-tight truncate">
            Chrysler&amp;Dodge<br />Pardubice
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-hide">
        <NavSection title="Hlavní" items={mainNav} />
        <NavSection title="Servis" items={serviceNav} />
        <NavSection title="Účet" items={accountNav} />
        {isAdmin && (
          <NavSection title="Administrace" items={[{ path: "/admin", label: "Admin Panel", icon: Shield }]} />
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-border/40">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Sbalit</span></>}
        </button>
      </div>
    </aside>
  );
};

export default DesktopSidebar;
