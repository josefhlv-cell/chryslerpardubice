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
import { Bot, Send, Phone, Wrench, AlertTriangle, Car, Loader2 } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };
type Vehicle = { id: string; brand: string; model: string; year: number | null; engine: string | null; vin: string | null };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-mechanic`;

const warningLights = [
  "Check Engine", "ABS", "Airbag", "Olej", "Teplota", "Baterie",
  "Brzdy", "ESP/Stabilita", "TPMS (tlak pneumatik)", "EPC",
];

const AiMechanic = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      supabase.from("user_vehicles").select("id, brand, model, year, engine, vin")
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

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Msg = { role: "user", content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);

    // Also notify admin
    if (user) {
      supabase.from("notifications").insert({
        user_id: user.id, // Will be visible to admin via admin query
        title: "AI Mechanik – dotaz",
        message: text.substring(0, 200),
      }).then(() => {});
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
    } catch (e) {
      console.error(e);
      toast.error("Chyba spojení s AI");
    }
    setIsLoading(false);
  };

  const handleWarningLight = (light: string) => {
    const vehicle = getVehicle();
    const vName = vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year || ""}` : "mém vozidle";
    sendMessage(`Na ${vName} svítí kontrolka: ${light}. Co to znamená a co mám dělat?`);
  };

  const callService = () => {
    window.location.href = "tel:+420123456789";
  };

  return (
    <div className="min-h-screen pb-20 flex flex-col">
      <PageHeader title="AI Mechanik" />
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
                <Bot className="w-10 h-10 mx-auto mb-2 text-primary" />
                <h2 className="font-display font-bold text-lg">AI Mechanik</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Popište problém s vozidlem – analyzuji příčinu a doporučím řešení.
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
              <Button variant="outline" className="flex-1 text-xs" onClick={() => navigate("/service")}>
                <Wrench className="w-3.5 h-3.5 mr-1" />Objednat servis
              </Button>
              <Button variant="outline" className="flex-1 text-xs" onClick={callService}>
                <Phone className="w-3.5 h-3.5 mr-1" />Zavolat servis
              </Button>
            </div>
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
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
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
              <div className="glass-card rounded-2xl px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

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

        {/* Input */}
        <div className="flex gap-2 items-end">
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
