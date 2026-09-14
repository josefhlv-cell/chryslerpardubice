import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Home, Loader2 } from "lucide-react";
import { consumeOAuthReturn, urlLooksLikeOAuthReturn } from "@/lib/oauthReturn";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [checkingOAuth, setCheckingOAuth] = useState(() =>
    typeof window !== "undefined" && urlLooksLikeOAuthReturn(window.location.href)
  );

  useEffect(() => {
    const href = window.location.href;
    const pathAndSearch = location.pathname + location.search + location.hash;

    if (!urlLooksLikeOAuthReturn(href) && !urlLooksLikeOAuthReturn(pathAndSearch)) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
      setCheckingOAuth(false);
      return;
    }

    let cancelled = false;
    setCheckingOAuth(true);
    (async () => {
      const result = await consumeOAuthReturn(href);
      if (cancelled) return;
      if (result.handled && result.ok) {
        navigate("/", { replace: true });
        return;
      }
      if (result.handled && !result.ok) {
        navigate("/auth", { replace: true });
        return;
      }
      navigate(
        {
          pathname: "/auth/callback",
          search: location.search,
          hash: location.hash,
        },
        { replace: true }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, location.hash, navigate]);

  if (checkingOAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm">Dokončuji přihlášení…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-display font-bold text-primary">404</h1>
        <p className="text-lg text-muted-foreground">Stránka nebyla nalezena</p>
        <p className="text-sm text-muted-foreground/70">
          Požadovaná stránka neexistuje nebo byla přesunuta.
        </p>
        <Button onClick={() => navigate("/")} className="mt-4">
          <Home className="w-4 h-4 mr-2" />
          Zpět na úvodní stránku
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
