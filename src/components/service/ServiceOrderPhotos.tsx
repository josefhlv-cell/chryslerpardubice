import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Camera, Loader2 } from "lucide-react";

type Photo = {
  id: string;
  photo_url: string;
  phase: string;
  description: string | null;
  created_at: string;
};

const PHASE_LABELS: Record<string, string> = {
  before: "Před opravou",
  during: "Během opravy",
  after: "Po opravě",
};

const ServiceOrderPhotos = ({ orderId, isAdmin }: { orderId: string; isAdmin: boolean }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState("before");

  const fetchPhotos = async () => {
    const { data } = await supabase
      .from("service_order_photos")
      .select("*")
      .eq("service_order_id", orderId)
      .order("created_at");
    setPhotos((data as Photo[]) || []);
  };

  useEffect(() => { fetchPhotos(); }, [orderId]);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `orders/${orderId}/${phase}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("service-order-photos").upload(path, file);
    if (uploadError) { toast({ title: "Chyba uploadu", variant: "destructive" }); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("service-order-photos").getPublicUrl(path);

    await supabase.from("service_order_photos").insert({
      service_order_id: orderId,
      photo_url: urlData.publicUrl,
      phase,
    } as any);

    fetchPhotos();
    setUploading(false);
  };

  const grouped = {
    before: photos.filter(p => p.phase === "before"),
    during: photos.filter(p => p.phase === "during"),
    after: photos.filter(p => p.phase === "after"),
  };

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-medium flex items-center gap-2 mb-3">
          <Camera className="w-4 h-4 text-primary" /> Fotodokumentace
        </p>

        {Object.entries(grouped).map(([key, items]) => (
          items.length > 0 && (
            <div key={key} className="mb-3">
              <Badge variant="outline" className="text-[10px] mb-1.5">{PHASE_LABELS[key]}</Badge>
              <div className="flex gap-1.5 flex-wrap">
                {items.map(p => (
                  <img key={p.id} src={p.photo_url} alt="" className="w-20 h-20 rounded object-cover border cursor-pointer"
                    onClick={() => window.open(p.photo_url, "_blank")} />
                ))}
              </div>
            </div>
          )
        ))}

        {photos.length === 0 && !isAdmin && (
          <p className="text-xs text-muted-foreground">Zatím žádné fotky</p>
        )}

        {isAdmin && (
          <div className="flex items-center gap-2 mt-2">
            <Select value={phase} onValueChange={setPhase}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PHASE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span>{uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Přidat fotku"}</span>
              </Button>
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                if (e.target.files?.[0]) uploadPhoto(e.target.files[0]);
              }} />
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceOrderPhotos;
