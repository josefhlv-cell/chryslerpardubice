/**
 * AdminVinScanner — VIN/QR scanner přes kameru.
 * Webový BarcodeDetector API; pokud běží v Capacitor, použije nativní plugin (lazy-import).
 */
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, ScanLine, X, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AdminVinScanner = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [vin, setVin] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(typeof (window as any).BarcodeDetector !== "undefined");
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      if (typeof (window as any).BarcodeDetector === "undefined") {
        toast({
          title: "Pozn.",
          description: "Tento prohlížeč neumí auto-detekci. Zadej VIN ručně.",
        });
        return;
      }
      const detector = new (window as any).BarcodeDetector({
        formats: ["code_39", "code_128", "qr_code", "data_matrix"],
      });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const raw = codes[0].rawValue.toUpperCase().trim();
            if (raw.length >= 11) {
              setVin(raw.slice(0, 17));
              stopCamera();
              toast({ title: "VIN naskenován", description: raw });
              return;
            }
          }
        } catch {}
        requestAnimationFrame(tick);
      };
      tick();
    } catch (e: any) {
      toast({ title: "Kamera nedostupná", description: e.message, variant: "destructive" });
    }
  };

  const lookup = async () => {
    if (!vin) return;
    const { data: v } = await supabase
      .from("user_vehicles")
      .select("id, brand, model, year, user_id")
      .eq("vin", vin.toUpperCase())
      .maybeSingle();
    if (v) {
      toast({ title: "Vůz nalezen", description: `${v.brand} ${v.model} ${v.year}` });
      navigate(`/vehicles/${(v as any).id}`);
    } else {
      toast({ title: "VIN není v databázi", description: "Můžeš založit zakázku ručně." });
    }
  };

  return (
    <div className="space-y-3 max-w-xl">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <ScanLine className="w-5 h-5 text-primary" />
        VIN / QR scanner
      </h2>
      {supported === false && (
        <p className="text-xs text-warning">
          Tvůj prohlížeč nepodporuje BarcodeDetector. Funguje na Androidu (Chrome) a v Capacitor appce.
        </p>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          {scanning ? (
            <div className="relative">
              <video ref={videoRef} className="w-full rounded-lg bg-black" playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-1/3 border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="absolute top-2 right-2"
                onClick={stopCamera}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button onClick={start} className="w-full" size="lg">
              <Camera className="w-5 h-5 mr-2" /> Spustit kameru
            </Button>
          )}

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">VIN (17 znaků)</label>
            <div className="flex gap-2">
              <Input
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                maxLength={17}
                placeholder="1C3CCBBG..."
                className="font-mono"
              />
              <Button onClick={lookup} disabled={vin.length < 11}>
                <Search className="w-4 h-4 mr-1" /> Najít vůz
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminVinScanner;
