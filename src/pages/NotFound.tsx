import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

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
