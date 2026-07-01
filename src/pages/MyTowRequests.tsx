import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Phone, Users, ChevronLeft } from "lucide-react";

type TowRow = {
  id: string;
  vehicle_info: string;
  problem_type: string;
  phone: string;
  passengers: number;
  latitude: number | null;
  longitude: number | null;
  location_text: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

const statusColor: Record<string, string> = {
  new: "bg-warning/15 text-warning border-warning/30",
  accepted: "bg-primary/15 text-primary border-primary/30",
  dispatched: "bg-primary/15 text-primary border-primary/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

const MyTowRequests = () => {
  const { user, isLoading } = useAuth();
  const [rows, setRows] = useState<TowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const focusId = sp.get("id");

  useEffect(() => {
    if (!isLoading && !user) navigate("/auth");
  }, [isLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("tow_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setRows((data as TowRow[]) || []);
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (focusId) {
      requestAnimationFrame(() => {
        document.getElementById(`tow-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [focusId, rows.length]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto p-4 pb-32 space-y-3">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2">
        <ChevronLeft className="w-4 h-4 mr-1" /> Zpět
      </Button>
      <h1 className="text-xl font-display font-semibold">Moje žádosti o odtah</h1>
      {rows.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Zatím jste neodeslali žádnou žádost o odtah.
          </CardContent>
        </Card>
      )}
      {rows.map((r) => (
        <Card
          key={r.id}
          id={`tow-${r.id}`}
          className={focusId === r.id ? "border-primary ring-1 ring-primary/40" : ""}
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{r.vehicle_info}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("cs-CZ")}</p>
              </div>
              <Badge className={statusColor[r.status] || ""}>{r.status}</Badge>
            </div>
            <p className="text-sm">{r.problem_type}</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {r.phone}</span>
              <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {r.passengers}</span>
              {r.latitude != null && r.longitude != null && (
                <a
                  href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  <MapPin className="w-3 h-3" /> Poloha na mapě
                </a>
              )}
            </div>
            {r.admin_note && (
              <div className="mt-2 p-2 rounded bg-muted/30 text-xs">
                <span className="font-semibold">Poznámka: </span>{r.admin_note}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default MyTowRequests;
