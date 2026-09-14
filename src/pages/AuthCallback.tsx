import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { consumeOAuthReturn } from "@/lib/oauthReturn";
import { toast } from "sonner";

/**
 * Dedicated landing route for social OAuth returns (Google / Apple via Lovable).
 * Prevents unknown callback paths from falling through to the 404 page.
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Dokončuji přihlášení…");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await consumeOAuthReturn(window.location.href);
        if (cancelled) return;

        if (result.handled && result.ok) {
          toast.success("Přihlášení úspěšné!");
          navigate("/", { replace: true });
          return;
        }

        if (result.handled && !result.ok) {
          setMessage(result.error || "Přihlášení selhalo");
          toast.error(result.error || "Přihlášení selhalo");
          window.setTimeout(() => navigate("/auth", { replace: true }), 1600);
          return;
        }

        // Arrived without tokens (manual open) → auth form
        navigate("/auth", { replace: true });
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Chyba při přihlášení";
        toast.error(msg);
        navigate("/auth", { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm text-center">{message}</p>
      </div>
    </div>
  );
};

export default AuthCallback;
