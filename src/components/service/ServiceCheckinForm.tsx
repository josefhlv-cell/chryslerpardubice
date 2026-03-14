import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ClipboardList, Camera, Loader2 } from "lucide-react";

type Checkin = {
  id: string;
  mileage: number | null;
  fuel_level: string | null;
  visible_damage: string | null;
  notes: string | null;
  photos: string[];
  signature_image: string | null;
  checkin_date: string;
};

const ServiceCheckinForm = ({ orderId, isAdmin }: { orderId: string; isAdmin: boolean }) => {
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mileage, setMileage] = useState("");
  const [fuelLevel, setFuelLevel] = useState("50%");
  const [damage, setDamage] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    supabase
      .from("service_checkins")
      .select("*")
      .eq("service_order_id", orderId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCheckin(data as Checkin);
        setLoading(false);
      });
  }, [orderId]);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `checkin/${orderId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("service-order-photos").upload(path, file);
    if (error) { toast({ title: "Chyba uploadu", variant: "destructive" }); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("service-order-photos").getPublicUrl(path);
    setPhotos(prev => [...prev, urlData.publicUrl]);
    setUploading(false);
  };

  const getSignatureData = () => {
    return canvasRef.current?.toDataURL("image/png") || null;
  };

  const saveCheckin = async () => {
    setSaving(true);
    const signatureData = getSignatureData();
    const { error } = await supabase.from("service_checkins").insert({
      service_order_id: orderId,
      mileage: mileage ? parseInt(mileage) : null,
      fuel_level: fuelLevel,
      visible_damage: damage || null,
      notes: notes || null,
      photos,
      signature_image: signatureData,
    } as any);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: "Předávací protokol uložen" });
      const { data } = await supabase.from("service_checkins").select("*").eq("service_order_id", orderId).maybeSingle();
      if (data) setCheckin(data as Checkin);
    }
    setSaving(false);
  };

  // Canvas drawing handlers
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "hsl(213, 70%, 45%)";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  if (loading) return null;

  // Show saved checkin
  if (checkin) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium flex items-center gap-2 mb-2">
            <ClipboardList className="w-4 h-4 text-primary" /> Předávací protokol
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            {checkin.mileage && <p>Stav km: {checkin.mileage.toLocaleString("cs")}</p>}
            {checkin.fuel_level && <p>Palivo: {checkin.fuel_level}</p>}
            {checkin.visible_damage && <p>Poškození: {checkin.visible_damage}</p>}
            {checkin.notes && <p>Poznámky: {checkin.notes}</p>}
          </div>
          {checkin.photos?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-2">
              {checkin.photos.map((url, i) => (
                <img key={i} src={url} alt="Checkin foto" className="w-16 h-16 rounded object-cover border cursor-pointer"
                  onClick={() => window.open(url, "_blank")} />
              ))}
            </div>
          )}
          {checkin.signature_image && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Podpis zákazníka:</p>
              <img src={checkin.signature_image} alt="Podpis" className="h-12 border rounded" />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!isAdmin) return null;

  // Create checkin form
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" /> Předávací protokol
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium">Stav km</label>
            <Input type="number" value={mileage} onChange={e => setMileage(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium">Palivo</label>
            <Select value={fuelLevel} onValueChange={setFuelLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Prázdná", "25%", "50%", "75%", "Plná"].map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium">Viditelné poškození</label>
          <Textarea value={damage} onChange={e => setDamage(e.target.value)} className="min-h-[60px]" />
        </div>
        <div>
          <label className="text-xs font-medium">Poznámky</label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[60px]" />
        </div>
        <div>
          <label className="text-xs font-medium">Fotografie</label>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {photos.map((url, i) => (
              <img key={i} src={url} alt="" className="w-16 h-16 rounded object-cover border" />
            ))}
          </div>
          <label className="cursor-pointer">
            <div className="flex items-center gap-2 text-xs text-primary hover:underline">
              <Camera className="w-4 h-4" /> {uploading ? "Nahrávám..." : "Přidat fotku"}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              if (e.target.files?.[0]) uploadPhoto(e.target.files[0]);
            }} />
          </label>
        </div>
        <div>
          <label className="text-xs font-medium">Podpis zákazníka</label>
          <canvas
            ref={canvasRef}
            width={300}
            height={100}
            className="w-full border rounded bg-background cursor-crosshair touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={() => {
            const ctx = canvasRef.current?.getContext("2d");
            if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }}>Vymazat podpis</Button>
        </div>
        <Button onClick={saveCheckin} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Uložit protokol
        </Button>
      </CardContent>
    </Card>
  );
};

export default ServiceCheckinForm;
