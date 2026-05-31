import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  User, Car, Package, Send, FileText, MessageSquare, StickyNote, Ban,
  Loader2, ExternalLink, RefreshCw, Truck,
} from "lucide-react";

type OrderRow = {
  id: string; user_id: string; part_id: string | null; part_name: string | null;
  oem_number: string | null; order_type: string; quantity: number;
  unit_price: number | null; discount_percent: number | null;
  discounted_price: number | null; price_with_vat: number | null;
  status: string; admin_note: string | null; customer_note: string | null;
  catalog_source: string | null; created_at: string;
};

type Profile = { user_id: string; full_name: string | null; email: string | null; phone: string | null; company_name: string | null; ico: string | null; dic: string | null; account_type: string; };
type Vehicle = { id: string; vin: string | null; brand: string; model: string; year: number | null; license_plate: string | null; engine: string | null; };
type JmOrder = { id: string; status: string; nextis_order_id: string | null; sent_at: string | null; error_message: string | null; attempts: number; };

const STATUS_OPTIONS = [
  { value: "nova", label: "Nová" },
  { value: "zpracovava_se", label: "Zpracovává se" },
  { value: "zaplacena", label: "Zaplacena" },
  { value: "vyrizena", label: "Vyřízena" },
  { value: "zrusena", label: "Zrušena" },
];

const STATUS_CLASS: Record<string, string> = {
  nova: "bg-warning/15 text-warning border-warning/30",
  zpracovava_se: "bg-primary/15 text-primary border-primary/30",
  zaplacena: "bg-success/15 text-success border-success/30",
  vyrizena: "bg-success/15 text-success border-success/30",
  zrusena: "bg-destructive/15 text-destructive border-destructive/30",
};

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  mopar: { label: "Originál Mopar", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  mopar_oem: { label: "Originál Mopar", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  csv: { label: "Originál (CSV)", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  jm: { label: "Náhrada J+M", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  sag: { label: "Náhrada SAG", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  ak: { label: "Náhrada AutoKelly", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  epc: { label: "EPC katalog", cls: "bg-purple-500/15 text-purple-400 border-purple-500/40" },
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("cs-CZ")} Kč`;
const fmtDate = (s: string) => new Date(s).toLocaleString("cs-CZ");

export default function AdminOrderDetail({
  order, open, onClose, onChanged,
}: {
  order: OrderRow | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jmOrder, setJmOrder] = useState<JmOrder | null>(null);
  const [status, setStatus] = useState(order?.status || "nova");
  const [note, setNote] = useState(order?.admin_note || "");
  const [msgOpen, setMsgOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setStatus(order.status);
    setNote(order.admin_note || "");
    void Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, phone, company_name, ico, dic, account_type").eq("user_id", order.user_id).maybeSingle()
        .then(({ data }) => setProfile(data as Profile | null)),
      supabase.from("user_vehicles").select("id, vin, brand, model, year, license_plate, engine").eq("user_id", order.user_id)
        .then(({ data }) => setVehicles((data as Vehicle[]) || [])),
      supabase.from("jm_orders").select("id, status, nextis_order_id, sent_at, error_message, attempts").eq("order_id", order.id).maybeSingle()
        .then(({ data }) => setJmOrder(data as JmOrder | null)),
    ]);
  }, [order?.id]);

  if (!order) return null;

  const sourceInfo = SOURCE_BADGE[order.catalog_source || ""] || { label: order.catalog_source || "Neznámý", cls: "bg-muted text-muted-foreground" };
  const isJm = order.catalog_source === "jm";

  const updateStatus = async (newStatus: string) => {
    setBusy("status");
    const { error } = await supabase.from("orders").update({ status: newStatus as any }).eq("id", order.id);
    setBusy(null);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    setStatus(newStatus);
    toast({ title: "Stav změněn", description: STATUS_OPTIONS.find((s) => s.value === newStatus)?.label });
    onChanged();
  };

  const saveNote = async () => {
    setBusy("note");
    const { error } = await supabase.from("orders").update({ admin_note: note }).eq("id", order.id);
    setBusy(null);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Poznámka uložena" });
    onChanged();
  };

  const cancelOrder = async () => {
    if (!confirm("Opravdu chceš stornovat tuto objednávku?")) return;
    await updateStatus("zrusena");
  };

  const sendToJm = async () => {
    setBusy("jm");
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-jm-order", { body: { order_id: order.id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Odesláno do J+M", description: `Nextis ID: ${(data as any)?.nextisOrderId ?? "—"}` });
      const { data: jm } = await supabase.from("jm_orders").select("id, status, nextis_order_id, sent_at, error_message, attempts").eq("order_id", order.id).maybeSingle();
      setJmOrder(jm as JmOrder | null);
      onChanged();
    } catch (e: any) {
      toast({ title: "Odeslání selhalo", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const openInvoice = () => {
    setMsgSubject(`Faktura k objednávce #${order.id.slice(0, 8)}`);
    setMsgBody(
      `Dobrý den${profile?.full_name ? ` ${profile.full_name}` : ""},\n\n` +
      `posíláme souhrn vaší objednávky:\n\n` +
      `Díl: ${order.part_name || "—"}\n` +
      `OEM: ${order.oem_number || "—"}\n` +
      `Množství: ${order.quantity}×\n` +
      `Cena bez DPH: ${fmt(order.discounted_price ?? order.unit_price)}\n` +
      `Cena s DPH (21 %): ${fmt(order.price_with_vat)}\n\n` +
      `Fakturu v PDF zašleme samostatně po dokončení.\n\n` +
      `Děkujeme za objednávku.\nChrysler Pardubice CHDP s.r.o.`
    );
    setInvOpen(true);
  };

  const openMessage = () => {
    setMsgSubject(`Zpráva k objednávce #${order.id.slice(0, 8)}`);
    setMsgBody(`Dobrý den${profile?.full_name ? ` ${profile.full_name}` : ""},\n\n`);
    setMsgOpen(true);
  };

  const sendEmail = async (kind: "message" | "invoice") => {
    if (!msgSubject.trim() || !msgBody.trim()) return toast({ title: "Vyplň předmět i zprávu", variant: "destructive" });
    setBusy("email");
    try {
      const { error } = await supabase.functions.invoke("customer-email", {
        body: { user_id: order.user_id, subject: msgSubject, body: msgBody, order_id: order.id, kind },
      });
      if (error) throw error;
      toast({ title: kind === "invoice" ? "Faktura odeslána" : "Zpráva odeslána", description: profile?.email || "" });
      setMsgOpen(false); setInvOpen(false);
    } catch (e: any) {
      toast({ title: "Odeslání selhalo", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Package className="w-5 h-5" />
              Objednávka #{order.id.slice(0, 8)}
              <Badge className={STATUS_CLASS[status] || ""}>{STATUS_OPTIONS.find((s) => s.value === status)?.label || status}</Badge>
              <Badge variant="outline" className={sourceInfo.cls}>{sourceInfo.label}</Badge>
              <span className="text-xs font-normal text-muted-foreground ml-auto">{fmtDate(order.created_at)}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* === ZÁKAZNÍK === */}
            <section className="rounded-md border p-3">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><User className="w-4 h-4" />Zákazník</h3>
              {profile ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div><span className="text-muted-foreground">Jméno:</span> {profile.full_name || "—"}</div>
                  <div><span className="text-muted-foreground">Typ:</span> {profile.account_type === "business" ? "Firma" : "Fyzická osoba"}</div>
                  <div><span className="text-muted-foreground">Email:</span> {profile.email ? <a className="text-primary underline" href={`mailto:${profile.email}`}>{profile.email}</a> : "—"}</div>
                  <div><span className="text-muted-foreground">Telefon:</span> {profile.phone ? <a className="text-primary underline" href={`tel:${profile.phone}`}>{profile.phone}</a> : "—"}</div>
                  {profile.company_name && <div className="col-span-2"><span className="text-muted-foreground">Firma:</span> {profile.company_name} {profile.ico && `· IČO ${profile.ico}`} {profile.dic && `· DIČ ${profile.dic}`}</div>}
                  <div className="col-span-2 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => window.open(`/admin/users?id=${order.user_id}`, "_blank")}>
                      <ExternalLink className="w-3 h-3 mr-1" />Otevřít profil zákazníka
                    </Button>
                  </div>
                </div>
              ) : <p className="text-xs text-muted-foreground">Načítám…</p>}
            </section>

            {/* === VOZIDLO === */}
            <section className="rounded-md border p-3">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Car className="w-4 h-4" />Vozidla zákazníka ({vehicles.length})</h3>
              {vehicles.length === 0 ? (
                <p className="text-xs text-muted-foreground">Zákazník nemá v garáži žádné vozidlo.</p>
              ) : (
                <div className="space-y-1">
                  {vehicles.map((v) => (
                    <div key={v.id} className="text-sm flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{v.brand} {v.model}</span>
                      {v.year && <span className="text-muted-foreground">{v.year}</span>}
                      {v.engine && <Badge variant="outline" className="text-[10px]">{v.engine}</Badge>}
                      {v.license_plate && <Badge variant="outline" className="text-[10px]">{v.license_plate}</Badge>}
                      {v.vin && <span className="text-[11px] font-mono text-muted-foreground">VIN {v.vin}</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* === POLOŽKY === */}
            <section className="rounded-md border p-3">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Package className="w-4 h-4" />Položky</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b">
                    <tr><th className="py-1 pr-2">Díl</th><th className="pr-2">OEM</th><th className="pr-2">Zdroj</th><th className="pr-2 text-right">Ks</th><th className="pr-2 text-right">Cena/ks</th><th className="text-right">Celkem s DPH</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 pr-2">
                        <div className="font-medium">{order.part_name || "—"}</div>
                        {order.order_type === "used" && <Badge variant="outline" className="text-[10px] mt-1">Použitý díl</Badge>}
                      </td>
                      <td className="pr-2 font-mono text-xs">{order.oem_number || "—"}</td>
                      <td className="pr-2"><Badge variant="outline" className={`text-[10px] ${sourceInfo.cls}`}>{sourceInfo.label}</Badge></td>
                      <td className="pr-2 text-right">{order.quantity}</td>
                      <td className="pr-2 text-right">{fmt(order.discounted_price ?? order.unit_price)}</td>
                      <td className="text-right font-semibold">{fmt(order.price_with_vat)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {(order.discount_percent ?? 0) > 0 && (
                <p className="text-xs text-success mt-2">Aplikována sleva {order.discount_percent}% (z {fmt(order.unit_price)})</p>
              )}
              {order.customer_note && (
                <div className="mt-2 text-xs"><span className="text-muted-foreground">Poznámka zákazníka:</span> <em>"{order.customer_note}"</em></div>
              )}
            </section>

            {/* === J+M STAV === */}
            {(isJm || jmOrder) && (
              <section className="rounded-md border p-3 bg-blue-500/5">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Truck className="w-4 h-4" />J+M (Nextis) dispatch</h3>
                {jmOrder ? (
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{jmOrder.status}</Badge>
                      {jmOrder.nextis_order_id && <Badge variant="outline" className="bg-amber-500/10">Nextis #{jmOrder.nextis_order_id}</Badge>}
                      <span className="text-xs text-muted-foreground">pokusů: {jmOrder.attempts}</span>
                      {jmOrder.sent_at && <span className="text-xs text-muted-foreground">{fmtDate(jmOrder.sent_at)}</span>}
                    </div>
                    {jmOrder.error_message && <p className="text-xs text-destructive font-mono">{jmOrder.error_message}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Zatím neodesláno. Dispatch proběhne automaticky při změně stavu na „zaplacena", nebo jej můžeš spustit ručně.</p>
                )}
              </section>
            )}

            {/* === STAV + POZNÁMKA === */}
            <section className="rounded-md border p-3 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Změnit stav</label>
                <Select value={status} onValueChange={updateStatus} disabled={busy === "status"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><StickyNote className="w-3 h-3" />Interní poznámka</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Poznámka viditelná jen pro admin…" />
                <Button size="sm" variant="outline" className="mt-2" onClick={saveNote} disabled={busy === "note"}>
                  {busy === "note" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}Uložit poznámku
                </Button>
              </div>
            </section>
          </div>

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={openMessage}><MessageSquare className="w-4 h-4 mr-1" />Zpráva zákazníkovi</Button>
            <Button variant="outline" onClick={openInvoice}><FileText className="w-4 h-4 mr-1" />Odeslat fakturu</Button>
            {isJm && (
              <Button variant="outline" onClick={sendToJm} disabled={busy === "jm"}>
                {busy === "jm" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                {jmOrder ? "Znovu na J+M" : "Odeslat na J+M"}
              </Button>
            )}
            <Button variant="destructive" onClick={cancelOrder} disabled={status === "zrusena"}>
              <Ban className="w-4 h-4 mr-1" />Storno
            </Button>
            <Button variant="ghost" onClick={onClose}>Zavřít</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Zpráva / Faktura dialog === */}
      <Dialog open={msgOpen || invOpen} onOpenChange={(v) => { if (!v) { setMsgOpen(false); setInvOpen(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {invOpen ? <FileText className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              {invOpen ? "Odeslat fakturu" : "Zpráva zákazníkovi"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Komu</label>
              <Input value={profile?.email || ""} disabled />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Předmět</label>
              <Input value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Zpráva</label>
              <Textarea rows={10} value={msgBody} onChange={(e) => setMsgBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMsgOpen(false); setInvOpen(false); }}>Zrušit</Button>
            <Button onClick={() => sendEmail(invOpen ? "invoice" : "message")} disabled={busy === "email"}>
              {busy === "email" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              Odeslat email + notifikaci
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
