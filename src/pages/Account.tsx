import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, ShoppingCart, Wrench, Percent, LogOut, ChevronRight, Shield, AlertTriangle, Car, Bell, ClipboardList, HardHat } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Account = () => {
  const navigate = useNavigate();
  const { user, profile, isAdmin, isPendingBusiness, signOut, isLoading, employee } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Můj účet" />
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Můj účet" />
        <div className="p-4 max-w-lg mx-auto text-center py-12 space-y-4">
          <div className="w-16 h-16 rounded-full brushed-metal border border-border/40 mx-auto flex items-center justify-center">
            <User className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <p className="text-muted-foreground text-sm">Pro zobrazení účtu se přihlaste</p>
          <Button variant="hero" onClick={() => navigate("/auth")}>Přihlásit se</Button>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const navItems = [
    { label: "Moje objednávky", icon: ShoppingCart, path: "/orders" },
    { label: "Moje vozidla", icon: Car, path: "/my-vehicles" },
    { label: "Oznámení", icon: Bell, path: "/notifications" },
    { label: "Servis", icon: Wrench, path: "/service" },
    { label: "Servisní zakázky", icon: ClipboardList, path: "/my-service-orders" },
  ];

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Můj účet" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Profile card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="luxury-card p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full gradient-bronze flex items-center justify-center shrink-0">
                <span className="font-display font-bold text-xl text-white">
                  {(profile?.full_name || "U").charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display font-semibold text-lg truncate">{profile?.full_name || "Uživatel"}</h2>
                <p className="text-sm text-muted-foreground truncate">{profile?.email || user.email}</p>
                {profile?.account_type === "business" && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{profile.company_name} · IČO: {profile.ico || "–"}</p>
                )}
              </div>
            </div>

            {isPendingBusiness && (
              <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                <p className="text-xs text-muted-foreground">Váš firemní účet čeká na schválení.</p>
              </div>
            )}

            {profile?.loyalty_active && profile.status === "active" && (
              <div className="mt-3 p-3 rounded-lg bg-primary/8 border border-primary/20">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">
                    {profile.account_type === "business" && profile.discount_percent > 0
                      ? `Firemní sleva ${profile.discount_percent}%`
                      : "Věrnostní program aktivní"}
                  </span>
                </div>
                {profile.account_type === "private" && (
                  <p className="text-xs text-muted-foreground mt-1">5 % sleva na díly · 10 % sleva na servis</p>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Navigation items */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="luxury-card divide-y divide-border/20 overflow-hidden">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-primary/5 transition-colors"
              >
                <span className="flex items-center gap-3 text-sm">
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                  {item.label}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
            {employee?.role === "mechanic" && (
              <button
                onClick={() => navigate("/mechanic-dashboard")}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-primary/5 transition-colors"
              >
                <span className="flex items-center gap-3 text-sm">
                  <HardHat className="w-4 h-4 text-primary" />
                  Dashboard mechanika
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => navigate("/admin")}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-primary/5 transition-colors"
              >
                <span className="flex items-center gap-3 text-sm">
                  <Shield className="w-4 h-4 text-primary" />
                  Admin panel
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </motion.div>

        {/* Logout */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-border/20 text-muted-foreground hover:text-foreground hover:border-destructive/30 transition-colors"
          >
            <span className="flex items-center gap-3 text-sm">
              <LogOut className="w-4 h-4" />
              Odhlásit se
            </span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default Account;
