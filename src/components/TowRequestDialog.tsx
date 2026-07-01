import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MapPin, Truck } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function TowRequestDialog({ open, onOpenChange }: Props) {
  const [vehicle, setVehicle] = useState("");
  const [problem, setProblem] = useState("");
  const [phone, setPhone] = useState("");
  const [passengers, setPassengers] = useState("1");
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocating(true);
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        setLocating(false);
      },
      (err) => {
        console.warn("geo err", err);
        setLocating(false);
        toast.error("Nepodařilo se získat polohu. Vyplňte ji ručně do popisu poruchy.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    // Prefill phone from profile
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user?.id) {
        const { data } = await supabase.from("profiles").select("phone").eq("user_id", u.user.id).maybeSingle();
        if (data?.phone) setPhone(data.phone);
      }
    })();
  }, [open]);

  const submit = async () => {
    if (!vehicle.trim() || !problem.trim() || !phone.trim()) {
      toast.error("Vyplňte prosím vozidlo, popis poruchy a telefon.");
      return;
    }
    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user?.id) {
      toast.error("Musíte být přihlášeni.");
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.from("tow_requests").insert({
      user_id: u.user.id,
      vehicle_info: vehicle.trim(),
      problem_type: problem.trim(),
      phone: phone.trim(),
      passengers: Math.max(1, parseInt(passengers) || 1),
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      accuracy: coords?.acc ?? null,
      location_text: coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Odeslání selhalo: " + error.message);
      return;
    }
    toast.success("Žádost o odtah byla odeslána. Servis vás bude kontaktovat.");
    setVehicle(""); setProblem(""); setPassengers("1");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" /> Žádost o odtah
          </DialogTitle>
          <DialogDescription>
            Vyplňte údaje. Vaše aktuální GPS poloha se odešle automaticky.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs rounded-md border p-2 bg-muted/30">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            {locating ? (
              <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Získávám polohu…</span>
            ) : coords ? (
              <span>GPS: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} (±{Math.round(coords.acc || 0)} m)</span>
            ) : (
              <span className="text-destructive">Poloha není k dispozici</span>
            )}
          </div>
          <div>
            <Label htmlFor="tow-veh">Vozidlo (značka, model, SPZ)</Label>
            <Input id="tow-veh" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Chrysler 300C, 1AB 2345" maxLength={120} />
          </div>
          <div>
            <Label htmlFor="tow-prob">Typ poruchy</Label>
            <Textarea id="tow-prob" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Např. nestartuje, defekt, přehřátí, nehoda…" rows={3} maxLength={500} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tow-phone">Telefon</Label>
              <Input id="tow-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+420…" maxLength={30} />
            </div>
            <div>
              <Label htmlFor="tow-pax">Počet osob</Label>
              <Input id="tow-pax" type="number" min={1} max={9} value={passengers} onChange={(e) => setPassengers(e.target.value)} />
            </div>
          </div>
          <Button className="w-full" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Truck className="w-4 h-4 mr-2" />}
            Odeslat žádost o odtah
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
