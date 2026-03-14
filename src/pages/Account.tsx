import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, ShoppingCart, Wrench, Percent, LogOut, ChevronRight, Shield, AlertTriangle, Car, Bell, ClipboardList } from "lucide-react";
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
          <User className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Pro zobrazení účtu se přihlaste</p>
          <Button variant="hero" onClick={() => navigate("/auth")}>Přihlásit se</Button>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Můj účet" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Profile card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center">
              <User className="w-7 h-7 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-display font-semibold text-lg">{profile?.full_name || "Uživatel"}</h2>
              <p className="text-sm text-muted-foreground">{profile?.email || user.email}</p>
              {profile?.account_type === "business" && (
                <p className="text-xs text-muted-foreground mt-0.5">{profile.company_name} · IČO: {profile.ico || "–"}</p>
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
            <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
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
        </motion.div>

        {/* Navigation items */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-1">
          <Button variant="ghost" className="w-full justify-between" onClick={() => navigate("/orders")}>
            <span className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" />Moje objednávky</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" className="w-full justify-between" onClick={() => navigate("/my-vehicles")}>
            <span className="flex items-center gap-2"><Car className="w-4 h-4" />Moje vozidla</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" className="w-full justify-between" onClick={() => navigate("/notifications")}>
            <span className="flex items-center gap-2"><Bell className="w-4 h-4" />Oznámení</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" className="w-full justify-between" onClick={() => navigate("/service")}>
            <span className="flex items-center gap-2"><Wrench className="w-4 h-4" />Servis</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" className="w-full justify-between" onClick={() => navigate("/my-service-orders")}>
            <span className="flex items-center gap-2"><ClipboardList className="w-4 h-4" />Servisní zakázky</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {isAdmin && (
            <Button variant="ghost" className="w-full justify-between" onClick={() => navigate("/admin")}>
              <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-primary" />Admin panel</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </motion.div>

        {/* Logout */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Button variant="ghost" className="w-full justify-between text-muted-foreground" onClick={handleSignOut}>
            <span className="flex items-center gap-2"><LogOut className="w-4 h-4" />Odhlásit se</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default Account;
