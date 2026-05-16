import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Share2, Copy, UserPlus, Link2, Loader2 } from "lucide-react";

interface Props {
  vehicleId: string;
  vehicleInfo: string;
}

interface ShareRecord {
  id: string;
  share_token: string;
  expires_at: string | null;
  transfer_to_email: string | null;
  transfer_status: string;
  created_at: string;
}

const ServiceBookShare = ({ vehicleId, vehicleInfo }: Props) => {
  const { user } = useAuth();
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferEmail, setTransferEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const fetchShares = async () => {
    const { data } = await supabase
      .from("service_book_shares")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false });
    if (data) setShares(data as ShareRecord[]);
    setLoading(false);
  };

  useEffect(() => { fetchShares(); }, [vehicleId]);

  const createShareLink = async () => {
    if (!user) return;
    setCreating(true);
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    await supabase.from("service_book_shares").insert({
      vehicle_id: vehicleId,
      owner_id: user.id,
      expires_at: expires.toISOString(),
    } as any);
    toast({ title: "Odkaz vytvořen", description: "Platnost 30 dní" });
    await fetchShares();
    setCreating(false);
  };

  const initiateTransfer = async () => {
    if (!user || !transferEmail.trim()) return;
    setCreating(true);
    await supabase.from("service_book_shares").insert({
      vehicle_id: vehicleId,
      owner_id: user.id,
      transfer_to_email: transferEmail.trim(),
      transfer_status: "pending",
    } as any);
    toast({
      title: "Převod iniciován",
      description: `Pozvánka odeslána na ${transferEmail}. Nový majitel si stáhne aplikaci a přihlásí se tímto emailem.`,
    });
    setTransferEmail("");
    setShowTransfer(false);
    await fetchShares();
    setCreating(false);
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/service-book/shared/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Odkaz zkopírován" });
  };

  if (loading) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">Sdílení servisní knížky</p>
        </div>

        <p className="text-xs text-muted-foreground">
          Sdílejte servisní historii vozidla {vehicleInfo} s potenciálním kupujícím nebo převeďte vozidlo na nového majitele.
        </p>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={createShareLink} disabled={creating}>
            <Link2 className="w-3.5 h-3.5 mr-1" />
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Vytvořit odkaz"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowTransfer(!showTransfer)}>
            <UserPlus className="w-3.5 h-3.5 mr-1" /> Převod vlastnictví
          </Button>
        </div>

        {showTransfer && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium">Převod vozidla na nového majitele</p>
            <p className="text-[10px] text-muted-foreground">
              Doporučte novému majiteli stáhnout si aplikaci Chrysler Pardubice. Po přihlášení s uvedeným emailem bude moci převzít vozidlo i servisní historii.
            </p>
            <Input
              placeholder="Email nového majitele"
              value={transferEmail}
              onChange={e => setTransferEmail(e.target.value)}
              type="email"
              className="text-sm"
            />
            <Button size="sm" onClick={initiateTransfer} disabled={!transferEmail.trim() || creating}>
              Odeslat pozvánku
            </Button>
          </div>
        )}

        {shares.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Aktivní sdílení</p>
            {shares.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                <div className="min-w-0">
                  {s.transfer_to_email ? (
                    <p className="text-xs">Převod → {s.transfer_to_email}</p>
                  ) : (
                    <p className="text-xs font-mono truncate">...{s.share_token.slice(-8)}</p>
                  )}
                  {s.expires_at && (
                    <p className="text-[10px] text-muted-foreground">
                      Platí do {new Date(s.expires_at).toLocaleDateString("cs-CZ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {s.transfer_status !== "none" && (
                    <Badge variant="secondary" className="text-[10px]">
                      {s.transfer_status === "pending" ? "Čeká" : s.transfer_status === "completed" ? "Dokončeno" : s.transfer_status}
                    </Badge>
                  )}
                  {!s.transfer_to_email && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyLink(s.share_token)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceBookShare;
