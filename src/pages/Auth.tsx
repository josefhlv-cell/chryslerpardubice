import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

type ViewMode = "login" | "register" | "forgot";

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword } = useAuth();
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [accountType, setAccountType] = useState<"private" | "business">("private");
  const [companyName, setCompanyName] = useState("");
  const [ico, setIco] = useState("");
  const [dic, setDic] = useState("");
  const [loading, setLoading] = useState(false);

  const getRedirectPath = async (userId: string): Promise<string> => {
    const { data: emp } = await supabase
      .from("employees")
      .select("role")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();

    if (emp) {
      switch (emp.role) {
        case "mechanic": return "/mechanic-dashboard";
        default: return "/";
      }
    }

    return "/";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (view === "login") {
        await signIn(email, password);
        const { data: { user: loggedUser } } = await supabase.auth.getUser();
        const path = loggedUser ? await getRedirectPath(loggedUser.id) : "/shop";
        toast.success("Přihlášení úspěšné!");
        navigate(path);
      } else if (view === "register") {
        if (!fullName.trim()) {
          toast.error("Vyplňte jméno a příjmení");
          setLoading(false);
          return;
        }
        if (!phone.trim()) {
          toast.error("Vyplňte telefonní číslo");
          setLoading(false);
          return;
        }
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
        // Save phone to profile after signup
        const { data: { user: newUser } } = await supabase.auth.getUser();
        if (newUser) {
          await supabase.from("profiles").update({ phone: phone.trim() }).eq("user_id", newUser.id);
        }
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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-5">
          <img
            src="/images/logo-cd-pardubice.png"
            alt="Chrysler&Dodge Pardubice"
            className="h-16 object-contain"
          />
          <div className="w-12 h-px bg-primary/30" />
          <h1 className="text-lg font-display font-semibold tracking-wide uppercase text-foreground/90">
            {view === "login" ? "Přihlášení" : view === "register" ? "Registrace" : "Reset hesla"}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {view === "register" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Typ účtu</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType("private")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 border ${
                      accountType === "private"
                        ? "border-primary/50 text-primary bg-primary/5"
                        : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/50"
                    }`}
                  >
                    <User className="w-4 h-4" />
                    Soukromá osoba
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType("business")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 border ${
                      accountType === "business"
                        ? "border-primary/50 text-primary bg-primary/5"
                        : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/50"
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    Firma / Servis
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Jméno a příjmení</Label>
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
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Název firmy *</Label>
                      <Input placeholder="AutoServis s.r.o." value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">IČO *</Label>
                      <Input placeholder="12345678" value={ico} onChange={(e) => setIco(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">DIČ (volitelné)</Label>
                      <Input placeholder="CZ12345678" value={dic} onChange={(e) => setDic(e.target.value)} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</Label>
            <Input type="email" placeholder="vas@email.cz" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          {view !== "forgot" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Heslo</Label>
              <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
          )}

          <Button className="w-full h-11 mt-2 gradient-bronze text-white font-semibold tracking-wide uppercase text-xs" type="submit" disabled={loading}>
            {loading
              ? "Zpracovávám..."
              : view === "login"
              ? "Přihlásit se"
              : view === "register"
              ? "Zaregistrovat se"
              : "Odeslat reset"}
          </Button>
        </form>

        {/* Google přihlášení - zobrazit pouze na login a register */}
        {view !== "forgot" && (
          <div className="space-y-3">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/30" />
              </div>
              <span className="relative bg-background px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                nebo
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 gap-3 text-sm font-medium border-border/30 hover:border-border/50"
              onClick={async () => {
                setLoading(true);
                try {
                  const { error } = await lovable.auth.signInWithOAuth("google", {
                    redirect_uri: window.location.origin,
                  });
                  if (error) throw error;
                } catch (err: any) {
                  toast.error(err.message || "Chyba při přihlášení přes Google");
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Pokračovat přes Google
            </Button>
          </div>
        )}

        <div className="text-center space-y-3 pt-2">
          {view === "login" && (
            <>
              <button onClick={() => setView("register")} className="text-sm text-primary hover:text-primary/80 transition-colors block mx-auto">
                Nemáte účet? Zaregistrujte se
              </button>
              <button onClick={() => setView("forgot")} className="text-xs text-muted-foreground hover:text-foreground transition-colors block mx-auto">
                Zapomněli jste heslo?
              </button>
            </>
          )}
          {view === "register" && (
            <button onClick={() => setView("login")} className="text-sm text-primary hover:text-primary/80 transition-colors">
              Máte účet? Přihlaste se
            </button>
          )}
          {view === "forgot" && (
            <button onClick={() => setView("login")} className="text-sm text-primary hover:text-primary/80 transition-colors">
              Zpět na přihlášení
            </button>
          )}
          <div className="pt-2">
            <button onClick={() => navigate("/shop")} className="text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wide">
              Pokračovat jako host →
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
