import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Car } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        toast.success("Přihlášení úspěšné!");
      } else {
        await signUp(email, password, fullName);
        toast.success("Registrace úspěšná! Zkontrolujte email.");
      }
      navigate("/parts");
    } catch (err: any) {
      toast.error(err.message || "Chyba při přihlášení");
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
            {isLogin ? "Přihlášení" : "Registrace"}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Jméno a příjmení</Label>
              <Input placeholder="Jan Novák" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" placeholder="vas@email.cz" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Heslo</Label>
            <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button variant="hero" className="w-full h-11" type="submit" disabled={loading}>
            {loading ? "Zpracovávám..." : isLogin ? "Přihlásit se" : "Zaregistrovat se"}
          </Button>
        </form>

        <div className="text-center space-y-2">
          <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-primary hover:underline">
            {isLogin ? "Nemáte účet? Zaregistrujte se" : "Máte účet? Přihlaste se"}
          </button>
          <br />
          <button onClick={() => navigate("/parts")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Pokračovat jako host →
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
