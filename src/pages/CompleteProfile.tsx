import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";

const CompleteProfile = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, isLoading } = useAuth();
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setPhone(profile.phone || "");
      setFullName(profile.full_name || "");
    }
  }, [profile]);

  useEffect(() => {
    if (!isLoading && !user) navigate("/auth");
    if (!isLoading && profile?.phone && profile?.full_name) navigate("/");
  }, [user, profile, isLoading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !fullName.trim()) {
      toast.error("Vyplňte jméno i telefon");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone: phone.trim(), full_name: fullName.trim() })
      .eq("user_id", user!.id);
    setSaving(false);
    if (error) {
      toast.error("Nepodařilo se uložit: " + error.message);
      return;
    }
    await refreshProfile();
    toast.success("Profil doplněn");
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-lg"
      >
        <h1 className="text-2xl font-display font-bold mb-2">Dokončete registraci</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Pro objednávky dílů a rezervaci servisu potřebujeme vaše jméno a telefonní číslo.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="full_name">Jméno a příjmení *</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jan Novák"
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">Telefon *</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+420 123 456 789"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Ukládám..." : "Pokračovat"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default CompleteProfile;
