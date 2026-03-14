import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Car, Building2, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<"private" | "business">("private");
  const [companyName, setCompanyName] = useState("");
  const [ico, setIco] = useState("");
  const [dic, setDic] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (view === "login") {
        await signIn(email, password);
        toast.success("Přihlášení úspěšné!");
        navigate("/shop");
      } else if (view === "register") {
        if (accountType === "business" && !companyName) {
          toast.error("Vyplňte název firmy");
          setLoading(false);
          return;
        }
        if (accountType === "business" && !ico) {
          toast.error("Vyplňte IČO");
          setLoading(false);
          return;
        }
        await signUp(email, password, {
          full_name: fullName,
          account_type: accountType,
          company_name: accountType === "business" ? companyName : undefined,
          ico: accountType === "business" ? ico : undefined,
          dic: accountType === "business" ? dic : undefined,
        });
        if (accountType === "business") {
          toast.success("Registrace odeslána! Váš firemní účet čeká na schválení administrátorem.");
        } else {
          toast.success("Registrace úspěšná! Zkontrolujte email pro ověření.");
        }
      } else if (view === "forgot") {
        await resetPassword(email);
        toast.success("Email pro reset hesla byl odeslán.");
        setView("login");
      }
    } catch (err: any) {
      toast.error(err.message || "Došlo k chybě");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gradient-dark">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-6"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center">
            <Car className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gradient">
            {view === "login" ? "Přihlášení" : view === "register" ? "Registrace" : "Reset hesla"}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {view === "register" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Typ účtu</Label>
                <div className="flex rounded-xl bg-secondary p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setAccountType("private")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                      accountType === "private"
                        ? "gradient-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <User className="w-4 h-4" />
                    Soukromá osoba
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType("business")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                      accountType === "business"
                        ? "gradient-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    Firma / Servis
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Jméno a příjmení</Label>
                <Input placeholder="Jan Novák" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>

              <AnimatePresence>
                {accountType === "business" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Název firmy *</Label>
                      <Input placeholder="AutoServis s.r.o." value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">IČO *</Label>
                      <Input placeholder="12345678" value={ico} onChange={(e) => setIco(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">DIČ (volitelné)</Label>
                      <Input placeholder="CZ12345678" value={dic} onChange={(e) => setDic(e.target.value)} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" placeholder="vas@email.cz" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          {view !== "forgot" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Heslo</Label>
              <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
          )}

          <Button variant="hero" className="w-full h-11" type="submit" disabled={loading}>
            {loading
              ? "Zpracovávám..."
              : view === "login"
              ? "Přihlásit se"
              : view === "register"
              ? "Zaregistrovat se"
              : "Odeslat reset"}
          </Button>
        </form>

        <div className="text-center space-y-2">
          {view === "login" && (
            <>
              <button onClick={() => setView("register")} className="text-sm text-primary hover:underline block mx-auto">
                Nemáte účet? Zaregistrujte se
              </button>
              <button onClick={() => setView("forgot")} className="text-sm text-muted-foreground hover:text-foreground transition-colors block mx-auto">
                Zapomněli jste heslo?
              </button>
            </>
          )}
          {view === "register" && (
            <button onClick={() => setView("login")} className="text-sm text-primary hover:underline">
              Máte účet? Přihlaste se
            </button>
          )}
          {view === "forgot" && (
            <button onClick={() => setView("login")} className="text-sm text-primary hover:underline">
              Zpět na přihlášení
            </button>
          )}
          <br />
          <button onClick={() => navigate("/shop")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Pokračovat jako host →
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
