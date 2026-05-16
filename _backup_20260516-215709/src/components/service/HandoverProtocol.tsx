import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Pen, Check, Download, Camera } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  orderId: string;
  vehicleInfo?: string;
  isAdmin: boolean;
  onSaved?: () => void;
}

const HandoverProtocol = ({ orderId, vehicleInfo, isAdmin, onSaved }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingCheckin, setExistingCheckin] = useState<any>(null);

  const [formData, setFormData] = useState({
    mileage: "",
    fuelLevel: "1/2",
    visibleDamage: "",
    notes: "",
  });

  // Load existing checkin
  useEffect(() => {
    supabase
      .from("service_checkins")
      .select("*")
      .eq("service_order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.length) {
          const c = data[0];
          setExistingCheckin(c);
          setFormData({
            mileage: c.mileage?.toString() || "",
            fuelLevel: c.fuel_level || "1/2",
            visibleDamage: c.visible_damage || "",
            notes: c.notes || "",
          });
          if (c.signature_image) setHasSigned(true);
        }
      });
  }, [orderId]);

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "hsl(0, 0%, 100%)";

    // Draw existing signature
    if (existingCheckin?.signature_image) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = existingCheckin.signature_image;
    }
  }, [existingCheckin]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
    setHasSigned(true);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasSigned(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const signatureData = canvasRef.current?.toDataURL("image/png") || null;

    const payload = {
      service_order_id: orderId,
      mileage: formData.mileage ? parseInt(formData.mileage) : null,
      fuel_level: formData.fuelLevel,
      visible_damage: formData.visibleDamage || null,
      notes: formData.notes || null,
      signature_image: signatureData,
    };

    let error;
    if (existingCheckin) {
      ({ error } = await supabase.from("service_checkins").update(payload).eq("id", existingCheckin.id));
    } else {
      ({ error } = await supabase.from("service_checkins").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Protokol uložen" });
    onSaved?.();
  };

  const exportPDF = () => {
    // Use browser print as PDF workaround
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const signatureData = canvasRef.current?.toDataURL("image/png") || "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Předávací protokol</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
        h1 { font-size: 20px; border-bottom: 2px solid #e11d48; padding-bottom: 8px; }
        .field { margin: 12px 0; }
        .label { font-weight: bold; font-size: 13px; color: #666; }
        .value { font-size: 14px; margin-top: 2px; }
        .signature { margin-top: 24px; border-top: 1px solid #ccc; padding-top: 12px; }
        .signature img { max-width: 300px; height: 100px; }
        .footer { margin-top: 40px; font-size: 11px; color: #999; }
      </style></head><body>
      <h1>Předávací protokol vozidla</h1>
      <div class="field"><span class="label">Vozidlo:</span><div class="value">${vehicleInfo || "—"}</div></div>
      <div class="field"><span class="label">Stav km:</span><div class="value">${formData.mileage || "—"} km</div></div>
      <div class="field"><span class="label">Palivo:</span><div class="value">${formData.fuelLevel}</div></div>
      <div class="field"><span class="label">Viditelná poškození:</span><div class="value">${formData.visibleDamage || "Bez poškození"}</div></div>
      <div class="field"><span class="label">Poznámky:</span><div class="value">${formData.notes || "—"}</div></div>
      <div class="signature">
        <span class="label">Podpis zákazníka:</span><br/>
        ${signatureData ? `<img src="${signatureData}" />` : "<p>Bez podpisu</p>"}
      </div>
      <div class="footer">
        Chrysler&Dodge Pardubice | ${new Date().toLocaleDateString("cs-CZ")} ${new Date().toLocaleTimeString("cs-CZ")}
      </div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const fuelLevels = ["E", "1/4", "1/2", "3/4", "F"];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="glass-card-elevated border-border/40">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Předávací protokol
            </h3>
            <div className="flex gap-2">
              {existingCheckin && (
                <Button size="sm" variant="outline" onClick={exportPDF}>
                  <Download className="w-3.5 h-3.5 mr-1" /> PDF
                </Button>
              )}
              {hasSigned && <Badge className="bg-success/15 text-success border-0">Podepsáno</Badge>}
            </div>
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Stav km</label>
              <Input
                type="number"
                placeholder="125 000"
                value={formData.mileage}
                onChange={e => setFormData(p => ({ ...p, mileage: e.target.value }))}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Stav paliva</label>
              <div className="flex gap-1.5">
                {fuelLevels.map(f => (
                  <button
                    key={f}
                    onClick={() => isAdmin && setFormData(p => ({ ...p, fuelLevel: f }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      formData.fuelLevel === f
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Viditelná poškození</label>
            <Textarea
              placeholder="Popis viditelných poškození při příjmu..."
              value={formData.visibleDamage}
              onChange={e => setFormData(p => ({ ...p, visibleDamage: e.target.value }))}
              rows={2}
              disabled={!isAdmin}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Poznámky</label>
            <Textarea
              placeholder="Další poznámky..."
              value={formData.notes}
              onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              disabled={!isAdmin}
            />
          </div>

          {/* Signature pad */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Pen className="w-3 h-3" /> Podpis zákazníka
              </label>
              <Button size="sm" variant="ghost" onClick={clearSignature} className="text-xs h-7">
                Vymazat podpis
              </Button>
            </div>
            <div className="rounded-xl border border-border/60 bg-secondary/30 overflow-hidden touch-none">
              <canvas
                ref={canvasRef}
                className="w-full h-[120px] cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
            </div>
          </div>

          {/* Actions */}
          {isAdmin && (
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                <Check className="w-4 h-4 mr-1" />
                {saving ? "Ukládám..." : existingCheckin ? "Aktualizovat protokol" : "Uložit protokol"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default HandoverProtocol;
