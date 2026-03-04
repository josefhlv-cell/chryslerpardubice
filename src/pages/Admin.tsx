import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ShoppingCart, Wrench, Car, Package, RefreshCw, Shield } from "lucide-react";

type Order = {
  id: string;
  brand: string;
  model: string | null;
  year: number | null;
  engine: string | null;
  part_name: string;
  oem_number: string | null;
  quantity: number;
  unit_price: number | null;
  discount_amount: number | null;
  total_price: number | null;
  status: string;
  admin_note: string | null;
  user_id: string;
  created_at: string;
};

type UsedRequest = {
  id: string;
  brand: string;
  model: string | null;
  year: string | null;
  part_name: string;
  note: string | null;
  status: string;
  admin_note: string | null;
  admin_price: number | null;
  admin_available: boolean | null;
  user_id: string;
  created_at: string;
};

type Booking = {
  id: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  service_type: string;
  preferred_date: string;
  confirmed_date: string | null;
  note: string | null;
  wants_replacement_vehicle: boolean;
  replacement_vehicle_confirmed: boolean | null;
  status: string;
  admin_note: string | null;
  estimated_price: number | null;
  discount_amount: number | null;
  final_price: number | null;
  user_id: string;
  created_at: string;
};

type Inquiry = {
  id: string;
  vehicle_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: string;
  user_id: string | null;
  created_at: string;
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  in_progress: "bg-purple-100 text-purple-800 border-purple-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
  shipped: "bg-indigo-100 text-indigo-800 border-indigo-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
  quoted: "bg-blue-100 text-blue-800 border-blue-300",
  accepted: "bg-green-100 text-green-800 border-green-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  fulfilled: "bg-green-100 text-green-800 border-green-300",
  new: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

const statusLabel: Record<string, string> = {
  pending: "Čeká",
  confirmed: "Potvrzeno",
  in_progress: "Probíhá",
  completed: "Dokončeno",
  cancelled: "Zrušeno",
  shipped: "Odesláno",
  delivered: "Doručeno",
  quoted: "Naceneno",
  accepted: "Přijato",
  rejected: "Odmítnuto",
  fulfilled: "Splněno",
  new: "Nový",
};

const Admin = () => {
  const { user, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [usedRequests, setUsedRequests] = useState<UsedRequest[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit dialogs
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editUsed, setEditUsed] = useState<UsedRequest | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);

  // Form state
  const [formNote, setFormNote] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formAvailable, setFormAvailable] = useState("");
  const [formConfirmedDate, setFormConfirmedDate] = useState("");
  const [formEstimatedPrice, setFormEstimatedPrice] = useState("");
  const [formFinalPrice, setFormFinalPrice] = useState("");
  const [formReplacementConfirmed, setFormReplacementConfirmed] = useState("");

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      navigate("/auth");
    }
  }, [isLoading, user, isAdmin, navigate]);

  const fetchAll = async () => {
    setLoading(true);
    const [o, u, b, i] = await Promise.all([
      supabase.from("new_part_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("used_part_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("service_bookings").select("*").order("created_at", { ascending: false }),
      supabase.from("vehicle_inquiries").select("*").order("created_at", { ascending: false }),
    ]);
    setOrders((o.data as Order[]) || []);
    setUsedRequests((u.data as UsedRequest[]) || []);
    setBookings((b.data as Booking[]) || []);
    setInquiries((i.data as Inquiry[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin]);

  // -- Order update --
  const openOrderEdit = (o: Order) => {
    setEditOrder(o);
    setFormStatus(o.status);
    setFormNote(o.admin_note || "");
  };

  const saveOrder = async () => {
    if (!editOrder) return;
    const { error } = await supabase
      .from("new_part_orders")
      .update({ status: formStatus as any, admin_note: formNote })
      .eq("id", editOrder.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Uloženo" });
    setEditOrder(null);
    fetchAll();
  };

  // -- Used request update --
  const openUsedEdit = (r: UsedRequest) => {
    setEditUsed(r);
    setFormStatus(r.status);
    setFormNote(r.admin_note || "");
    setFormPrice(r.admin_price?.toString() || "");
    setFormAvailable(r.admin_available === null ? "" : r.admin_available ? "yes" : "no");
  };

  const saveUsed = async () => {
    if (!editUsed) return;
    const { error } = await supabase
      .from("used_part_requests")
      .update({
        status: formStatus as any,
        admin_note: formNote,
        admin_price: formPrice ? parseFloat(formPrice) : null,
        admin_available: formAvailable === "" ? null : formAvailable === "yes",
      })
      .eq("id", editUsed.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Uloženo" });
    setEditUsed(null);
    fetchAll();
  };

  // -- Booking update --
  const openBookingEdit = (b: Booking) => {
    setEditBooking(b);
    setFormStatus(b.status);
    setFormNote(b.admin_note || "");
    setFormConfirmedDate(b.confirmed_date || "");
    setFormEstimatedPrice(b.estimated_price?.toString() || "");
    setFormFinalPrice(b.final_price?.toString() || "");
    setFormReplacementConfirmed(b.replacement_vehicle_confirmed === null ? "" : b.replacement_vehicle_confirmed ? "yes" : "no");
  };

  const saveBooking = async () => {
    if (!editBooking) return;
    const { error } = await supabase
      .from("service_bookings")
      .update({
        status: formStatus as any,
        admin_note: formNote,
        confirmed_date: formConfirmedDate || null,
        estimated_price: formEstimatedPrice ? parseFloat(formEstimatedPrice) : null,
        final_price: formFinalPrice ? parseFloat(formFinalPrice) : null,
        replacement_vehicle_confirmed: formReplacementConfirmed === "" ? null : formReplacementConfirmed === "yes",
      })
      .eq("id", editBooking.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Uloženo" });
    setEditBooking(null);
    fetchAll();
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("cs-CZ");

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Admin panel" />
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary" />
          <span className="text-sm text-muted-foreground">Správa objednávek a požadavků</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4 mr-1" /> Obnovit
          </Button>
        </div>

        <Tabs defaultValue="orders">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="orders" className="text-xs gap-1"><ShoppingCart className="w-3 h-3" />Objednávky</TabsTrigger>
            <TabsTrigger value="used" className="text-xs gap-1"><Package className="w-3 h-3" />Použité</TabsTrigger>
            <TabsTrigger value="service" className="text-xs gap-1"><Wrench className="w-3 h-3" />Servis</TabsTrigger>
            <TabsTrigger value="inquiries" className="text-xs gap-1"><Car className="w-3 h-3" />Poptávky</TabsTrigger>
          </TabsList>

          {/* ORDERS */}
          <TabsContent value="orders">
            <div className="space-y-3 mt-2">
              {orders.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádné objednávky</p>}
              {orders.map((o) => (
                <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openOrderEdit(o)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{o.part_name}</p>
                          <p className="text-xs text-muted-foreground">{o.brand} {o.model} {o.year} · {o.quantity}×</p>
                          <p className="text-xs text-muted-foreground mt-1">{fmtDate(o.created_at)} · {o.id.slice(0, 8)}</p>
                        </div>
                        <div className="text-right">
                          <Badge className={statusColors[o.status] || ""}>{statusLabel[o.status] || o.status}</Badge>
                          {o.total_price && <p className="text-sm font-semibold mt-1">{o.total_price.toLocaleString("cs")} Kč</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* USED PARTS */}
          <TabsContent value="used">
            <div className="space-y-3 mt-2">
              {usedRequests.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádné poptávky</p>}
              {usedRequests.map((r) => (
                <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openUsedEdit(r)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{r.part_name}</p>
                          <p className="text-xs text-muted-foreground">{r.brand} {r.model} {r.year}</p>
                          {r.note && <p className="text-xs text-muted-foreground mt-1 italic">"{r.note}"</p>}
                          <p className="text-xs text-muted-foreground mt-1">{fmtDate(r.created_at)} · {r.id.slice(0, 8)}</p>
                        </div>
                        <div className="text-right">
                          <Badge className={statusColors[r.status] || ""}>{statusLabel[r.status] || r.status}</Badge>
                          {r.admin_price && <p className="text-sm font-semibold mt-1">{r.admin_price.toLocaleString("cs")} Kč</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* SERVICE */}
          <TabsContent value="service">
            <div className="space-y-3 mt-2">
              {bookings.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádné rezervace</p>}
              {bookings.map((b) => (
                <motion.div key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openBookingEdit(b)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{b.service_type}</p>
                          <p className="text-xs text-muted-foreground">{b.vehicle_brand} {b.vehicle_model}</p>
                          <p className="text-xs text-muted-foreground mt-1">Požadováno: {fmtDate(b.preferred_date)}</p>
                          {b.wants_replacement_vehicle && <Badge variant="outline" className="text-xs mt-1">Náhradní vůz</Badge>}
                        </div>
                        <div className="text-right">
                          <Badge className={statusColors[b.status] || ""}>{statusLabel[b.status] || b.status}</Badge>
                          {b.final_price && <p className="text-sm font-semibold mt-1">{b.final_price.toLocaleString("cs")} Kč</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* INQUIRIES */}
          <TabsContent value="inquiries">
            <div className="space-y-3 mt-2">
              {inquiries.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádné poptávky vozidel</p>}
              {inquiries.map((i) => (
                <motion.div key={i.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{i.name || "Bez jména"}</p>
                          <p className="text-xs text-muted-foreground">{i.email} · {i.phone}</p>
                          {i.message && <p className="text-xs text-muted-foreground mt-1 italic">"{i.message}"</p>}
                          <p className="text-xs text-muted-foreground mt-1">{fmtDate(i.created_at)}</p>
                        </div>
                        <Badge className={statusColors[i.status] || ""}>{statusLabel[i.status] || i.status}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ORDER EDIT DIALOG */}
      <Dialog open={!!editOrder} onOpenChange={() => setEditOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upravit objednávku</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending", "confirmed", "shipped", "delivered", "cancelled"].map(s => (
                    <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Poznámka admina</label>
              <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Zrušit</Button>
            <Button onClick={saveOrder}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* USED REQUEST EDIT DIALOG */}
      <Dialog open={!!editUsed} onOpenChange={() => setEditUsed(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nacenit použitý díl</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending", "quoted", "accepted", "rejected", "fulfilled"].map(s => (
                    <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Dostupný?</label>
              <Select value={formAvailable} onValueChange={setFormAvailable}>
                <SelectTrigger><SelectValue placeholder="Vyberte" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Ano</SelectItem>
                  <SelectItem value="no">Ne</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Cena (Kč)</label>
              <Input type="number" value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-medium">Poznámka admina</label>
              <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUsed(null)}>Zrušit</Button>
            <Button onClick={saveUsed}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BOOKING EDIT DIALOG */}
      <Dialog open={!!editBooking} onOpenChange={() => setEditBooking(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upravit servisní rezervaci</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending", "confirmed", "in_progress", "completed", "cancelled"].map(s => (
                    <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Potvrzený datum</label>
              <Input type="date" value={formConfirmedDate} onChange={e => setFormConfirmedDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Odhadovaná cena (Kč)</label>
              <Input type="number" value={formEstimatedPrice} onChange={e => setFormEstimatedPrice(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Finální cena (Kč)</label>
              <Input type="number" value={formFinalPrice} onChange={e => setFormFinalPrice(e.target.value)} />
            </div>
            {editBooking?.wants_replacement_vehicle && (
              <div>
                <label className="text-sm font-medium">Náhradní vůz potvrzen?</label>
                <Select value={formReplacementConfirmed} onValueChange={setFormReplacementConfirmed}>
                  <SelectTrigger><SelectValue placeholder="Vyberte" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Ano</SelectItem>
                    <SelectItem value="no">Ne</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Poznámka admina</label>
              <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBooking(null)}>Zrušit</Button>
            <Button onClick={saveBooking}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
