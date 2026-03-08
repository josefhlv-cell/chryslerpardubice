import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Send, Phone, Wrench, AlertTriangle, Car, Loader2, Camera, ImagePlus, ShoppingCart } from "lucide-react";
import TondaAvatar from "@/components/TondaAvatar";

type Msg = { role: "user" | "assistant"; content: string };
type Vehicle = { id: string; brand: string; model: string; year: number | null; engine: string | null; vin: string | null; mileage?: number | null };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-mechanic`;

const warningLights = [
  "Check Engine", "ABS", "Airbag", "Olej", "Teplota", "Baterie",
  "Brzdy", "ESP/Stabilita", "TPMS (tlak pneumatik)", "EPC",
];

const SERVICE_PHONE = "+420123456789";

const AiMechanic = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showDangerWarning, setShowDangerWarning] = useState(false);
  const [recommendedParts, setRecommendedParts] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      supabase.from("user_vehicles").select("id, brand, model, year, engine, vin, current_mileage")
        .eq("user_id", user.id).then(({ data }) => {
          setVehicles((data as Vehicle[]) || []);
          if (data?.length === 1) setSelectedVehicle(data[0].id);
        });
    }
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getVehicle = () => vehicles.find(v => v.id === selectedVehicle) || null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const newPhotos = [...uploadedPhotos];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${user?.id || "anon"}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("fault-photos").upload(path, file);
      if (error) { toast.error("Chyba nahrávání fotky"); continue; }
      const { data: urlData } = supabase.storage.from("fault-photos").getPublicUrl(path);
      newPhotos.push(urlData.publicUrl);
    }
    setUploadedPhotos(newPhotos);
    setUploading(false);
  };

  const createFaultReport = async (description: string, aiAnalysis?: string, riskLevel?: string) => {
    if (!user) return;
    const vehicle = getVehicle();
    try {
      await supabase.from("fault_reports" as any).insert({
        user_id: user.id,
        vehicle_id: vehicle?.id || null,
        vin: vehicle?.vin || null,
        vehicle_brand: vehicle?.brand || null,
        vehicle_model: vehicle?.model || null,
        vehicle_year: vehicle?.year || null,
        vehicle_engine: vehicle?.engine || null,
        description: description.substring(0, 500),
        photos: uploadedPhotos,
        ai_analysis: aiAnalysis || null,
        ai_risk_level: riskLevel || "unknown",
      } as any);
    } catch {}

    // Notify admin
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "🚨 Hlášení poruchy",
      message: `${vehicle ? `${vehicle.brand} ${vehicle.model}` : "Neznámé vozidlo"}: ${description.substring(0, 200)}`,
    });
  };

  const checkForDanger = (text: string) => {
    const dangerKeywords = ["motor", "přehřátí", "brzd", "olej", "teplota", "kouř", "únik", "nebezpeč", "nehod", "požár"];
    const lower = text.toLowerCase();
    return dangerKeywords.some(k => lower.includes(k));
  };

  const searchRecommendedParts = async (aiResponse: string) => {
    const partKeywords = aiResponse.match(/\b\d{8,}[A-Z]{0,2}\b/g);
    if (partKeywords?.length) {
      const { data } = await supabase.from("parts_new").select("*").in("oem_number", partKeywords).limit(5);
      if (data?.length) setRecommendedParts(data);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const photoContext = uploadedPhotos.length > 0 ? `\n[Zákazník přiložil ${uploadedPhotos.length} fotografii/e]` : "";
    const fullText = text + photoContext;
    const userMsg: Msg = { role: "user", content: fullText };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);
    setShowDangerWarning(false);
    setRecommendedParts([]);

    // Create fault report immediately
    await createFaultReport(text);

    // Auto-create service booking
    if (user) {
      const vehicle = getVehicle();
      try {
        await supabase.from("service_bookings").insert({
          user_id: user.id,
          vehicle_brand: vehicle?.brand || "Neznámá",
          vehicle_model: vehicle?.model || "Neznámý",
          service_type: "Diagnostika – hlášení poruchy",
          preferred_date: new Date().toISOString().split("T")[0],
          note: `AI hlášení: ${text.substring(0, 300)}${uploadedPhotos.length > 0 ? `\nFotky: ${uploadedPhotos.join(", ")}` : ""}`,
          wants_replacement_vehicle: false,
        });
      } catch {}
    }

    let assistantSoFar = "";
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, vehicle: getVehicle() }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Chyba" }));
        toast.error(err.error || "Chyba AI služby");
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Check for danger in AI response
      if (checkForDanger(assistantSoFar)) {
        setShowDangerWarning(true);
      }

      // Search for recommended parts
      await searchRecommendedParts(assistantSoFar);

      // Update fault report with AI analysis
      if (user) {
        const riskLevel = checkForDanger(assistantSoFar) ? "high" : "low";
        // Update latest fault report
        const { data: reports } = await supabase.from("fault_reports" as any).select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
        if ((reports as any)?.length) {
          await supabase.from("fault_reports" as any).update({ ai_analysis: assistantSoFar.substring(0, 2000), ai_risk_level: riskLevel } as any).eq("id", (reports as any)[0].id);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Chyba spojení s AI");
    }
    setIsLoading(false);
    setUploadedPhotos([]);
  };

  const handleWarningLight = (light: string) => {
    const vehicle = getVehicle();
    const vName = vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year || ""}` : "mém vozidle";
    sendMessage(`Na ${vName} svítí kontrolka: ${light}. Co to znamená a co mám dělat?`);
  };

  const callService = () => { window.location.href = `tel:${SERVICE_PHONE}`; };

  return (
    <div className="min-h-screen pb-20 flex flex-col">
      <PageHeader title="Tonda – AI Mechanik" />
      <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col gap-3">
        {/* Vehicle selector */}
        {vehicles.length > 0 && (
          <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Vyberte vozidlo" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.brand} {v.model} {v.year || ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Welcome message */}
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Card className="border-primary/30">
              <CardContent className="p-4 text-center">
                <p className="text-xs font-semibold text-primary mb-1">Tonda</p>
                <Bot className="w-10 h-10 mx-auto mb-2 text-primary" />
                <h2 className="font-display font-bold text-lg">Ahoj, jsem Tonda!</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Váš AI mechanik. Popište problém, přiložte fotku nebo zvuk – analyzuji příčinu a doporučím řešení.
                </p>
              </CardContent>
            </Card>

            {/* Warning lights */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Svítí vám kontrolka?</p>
              <div className="flex flex-wrap gap-1.5">
                {warningLights.map(l => (
                  <Button key={l} size="sm" variant="outline" className="text-xs h-8" onClick={() => handleWarningLight(l)}>
                    <AlertTriangle className="w-3 h-3 mr-1 text-warning" />{l}
                  </Button>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 text-xs" onClick={() => navigate("/emergency")}>
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />Pomoc při poruše
              </Button>
              <Button variant="outline" className="flex-1 text-xs" onClick={callService}>
                <Phone className="w-3.5 h-3.5 mr-1" />Zavolat servis
              </Button>
            </div>
          </motion.div>
        )}

        {/* Danger warning */}
        {showDangerWarning && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="border-destructive bg-destructive/10">
              <CardContent className="p-4 text-center">
                <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-destructive" />
                <h3 className="font-bold text-destructive text-lg">⚠️ NEPOKRAČUJTE V JÍZDĚ</h3>
                <p className="text-sm text-destructive font-medium mt-1">
                  MOŽNÉ RIZIKO POŠKOZENÍ MOTORU NEBO NEBEZPEČÍ NEHODY.
                </p>
                <Button variant="destructive" className="w-full mt-3" onClick={callService}>
                  <Phone className="w-4 h-4 mr-2" />ZAVOLAT SERVIS IHNED
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex flex-col items-center mr-2 shrink-0">
                  <span className="text-[9px] font-bold text-primary">Tonda</span>
                  <Bot className="w-6 h-6 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "gradient-primary text-primary-foreground"
                  : "glass-card"
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </motion.div>
          ))}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="flex flex-col items-center mr-2 shrink-0">
                <span className="text-[9px] font-bold text-primary">Tonda</span>
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <div className="glass-card rounded-2xl px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Recommended parts */}
        {recommendedParts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-primary">Doporučené Mopar díly:</p>
            {recommendedParts.map(p => (
              <Card key={p.id} className="border-primary/20">
                <CardContent className="p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">OEM: {p.oem_number}</p>
                    <p className="text-xs font-semibold">{p.price_with_vat?.toLocaleString("cs")} Kč</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate("/shop")}>
                    <ShoppingCart className="w-3.5 h-3.5 mr-1" />Objednat
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Action buttons after AI response */}
        {messages.length > 0 && !isLoading && messages[messages.length - 1]?.role === "assistant" && (
          <div className="flex gap-2">
            <Button size="sm" variant="hero" className="flex-1 text-xs" onClick={callService}>
              <Phone className="w-3.5 h-3.5 mr-1" />Zavolat servis
            </Button>
            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => navigate("/service")}>
              <Wrench className="w-3.5 h-3.5 mr-1" />Objednat servis
            </Button>
            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => navigate("/shop")}>
              <Car className="w-3.5 h-3.5 mr-1" />Objednat díl
            </Button>
          </div>
        )}

        {/* Photo upload previews */}
        {uploadedPhotos.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {uploadedPhotos.map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt="Foto" className="w-14 h-14 rounded object-cover border" />
                <button onClick={() => setUploadedPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100">×</button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 items-end">
          <Button
            size="icon"
            variant="outline"
            className="h-10 w-10 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
          <Textarea
            placeholder="Popište problém s vozidlem..."
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={2}
            className="flex-1 text-sm resize-none"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          />
          <Button
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AiMechanic;
