import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Camera, Package, CheckCircle, XCircle, Clock, Wrench, FileText } from "lucide-react";
import ServiceCheckinForm from "./ServiceCheckinForm";
import ServiceOrderPhotos from "./ServiceOrderPhotos";
import ServiceOrderParts from "./ServiceOrderParts";
import ServiceOrderTasks from "./ServiceOrderTasks";
import ServiceStatusTimeline from "./ServiceStatusTimeline";
import HandoverProtocol from "./HandoverProtocol";

type Vehicle = { id: string; brand: string; model: string; year: number | null; license_plate: string | null; user_id: string };

const STATUS_LABELS: Record<string, string> = {
  received: "Přijato do servisu",
  diagnostics: "Diagnostika",
  waiting_approval: "Čeká na schválení",
  waiting_parts: "Čeká na díly",
  in_repair: "Oprava probíhá",
  testing: "Testování vozidla",
  ready_pickup: "Připraveno k vyzvednutí",
  completed: "Dokončeno",
};

const STATUS_ORDER = ["received", "diagnostics", "waiting_approval", "waiting_parts", "in_repair", "testing", "ready_pickup", "completed"];

const STATUS_COLORS: Record<string, string> = {
  received: "bg-warning/15 text-warning border-0",
  diagnostics: "bg-blue-500/15 text-blue-400 border-0",
  waiting_approval: "bg-orange-500/15 text-orange-400 border-0",
  waiting_parts: "bg-purple-500/15 text-purple-400 border-0",
  in_repair: "bg-primary/15 text-primary border-0",
  testing: "bg-cyan-500/15 text-cyan-400 border-0",
  ready_pickup: "bg-success/15 text-success border-0",
  completed: "bg-success/20 text-success border-0",
};

interface Props {
  order: any;
  vehicles: Vehicle[];
  onBack: () => void;
  isAdmin: boolean;
}

const ServiceOrderDetail = ({ order: initialOrder, vehicles, onBack, isAdmin }: Props) => {
  const { user } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const [order, setOrder] = useState(initialOrder);
  const [newStatus, setNewStatus] = useState(order.status);
  const [statusNote, setStatusNote] = useState("");

  const vehicle = vehicles.find(v => v.id === order.vehicle_id);

  const fetchOrder = async () => {
    const { data } = await supabase.from("service_orders").select("*").eq("id", order.id).single();
    if (data) setOrder(data);
  };

  useEffect(() => {
    const channel = supabase
      .channel(`service-order-${order.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_orders", filter: `id=eq.${order.id}` }, (payload) => {
        setOrder(payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [order.id]);

  const changeStatus = async () => {
    if (newStatus === order.status) return;

    // Insert status history
    await supabase.from("service_order_status_history").insert({
      service_order_id: order.id,
      old_status: order.status,
      new_status: newStatus,
      changed_by: user?.id,
      note: statusNote || null,
    } as any);

    // Update order
    const { error } = await supabase
      .from("service_orders")
      .update({ status: newStatus as any } as any)
      .eq("id", order.id);

    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }

    // Send notification to customer via edge function
    if (isEnabled("notifications")) {
      await supabase.functions.invoke("service-status-notify", {
        body: { order_id: order.id, new_status: newStatus, user_id: order.user_id },
      });
    }

    // If completed, create service_history record
    if (newStatus === "completed") {
      await completeOrder();
    }

    toast({ title: "Stav změněn" });
    setStatusNote("");
    fetchOrder();
  };

  const completeOrder = async () => {
    // Auto-add to service book
    if (order.vehicle_id) {
      await supabase.from("service_history").insert({
        vehicle_id: order.vehicle_id,
        user_id: order.user_id,
        service_type: "Servisní zakázka",
        description: order.planned_work || order.description || "Servisní oprava",
        mileage: order.mileage,
        price: order.total_price || order.estimated_price,
        service_date: new Date().toISOString().split("T")[0],
      });
    }

    // Create invoice if enabled
    if (isEnabled("service_invoices")) {
      const laborPrice = order.labor_price || 0;
      const partsPrice = order.parts_total || 0;
      const subtotal = laborPrice + partsPrice;
      const vatAmount = subtotal * ((order.vat_rate || 21) / 100);
      await supabase.from("service_invoices").insert({
        service_order_id: order.id,
        labor_price: laborPrice,
        parts_price: partsPrice,
        vat_amount: vatAmount,
        total_price: subtotal + vatAmount,
        invoice_number: `SV-${Date.now().toString(36).toUpperCase()}`,
      } as any);
    }
  };

  const handleApproval = async (approved: boolean) => {
    await supabase.from("service_orders").update({
      customer_approved: approved,
      status: (approved ? "in_repair" : "received") as any,
    } as any).eq("id", order.id);

    await supabase.from("service_order_status_history").insert({
      service_order_id: order.id,
      old_status: "waiting_approval",
      new_status: approved ? "in_repair" : "received",
      changed_by: user?.id,
      note: approved ? "Zákazník schválil opravu" : "Zákazník neschválil opravu",
    } as any);

    if (isEnabled("notifications")) {
      // Notify admins
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (adminRoles) {
        for (const ar of adminRoles) {
          await supabase.from("notifications").insert({
            user_id: ar.user_id,
            title: approved ? "Oprava schválena" : "Oprava zamítnuta",
            message: `Zákazník ${approved ? "schválil" : "zamítl"} opravu vozidla.`,
          });
        }
      }
    }

    toast({ title: approved ? "Oprava schválena" : "Oprava zamítnuta" });
    fetchOrder();
  };

  return (
    <div className="space-y-4">
      {/* Order header */}
      <Card className="glass-card-elevated border-border/40">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-display font-semibold">
                {vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year || ""}` : "—"}
              </p>
              {vehicle?.license_plate && <p className="text-xs text-muted-foreground">SPZ: {vehicle.license_plate}</p>}
            </div>
            <Badge className={STATUS_COLORS[order.status] || ""}>{STATUS_LABELS[order.status] || order.status}</Badge>
          </div>
          {order.description && <p className="text-sm text-muted-foreground">{order.description}</p>}
          {order.planned_work && <p className="text-sm mt-1">{order.planned_work}</p>}
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
            {order.mileage && <span>{order.mileage.toLocaleString("cs")} km</span>}
            {order.estimated_price && <span>~{order.estimated_price.toLocaleString("cs")} Kč</span>}
            {order.eta_completion && <span>ETA: {new Date(order.eta_completion).toLocaleDateString("cs-CZ")}</span>}
          </div>
          {order.total_price > 0 && (
            <p className="text-sm font-semibold mt-2">Celkem: {order.total_price.toLocaleString("cs")} Kč</p>
          )}
        </CardContent>
      </Card>

      {/* Customer approval */}
      {!isAdmin && order.status === "waiting_approval" && isEnabled("service_approval") && (
        <Card className="glass-card border-warning/20">
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-2">Servis čeká na vaše schválení opravy</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleApproval(true)} className="flex-1">
                <CheckCircle className="w-4 h-4 mr-1" /> Schvaluji opravu
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleApproval(false)} className="flex-1">
                <XCircle className="w-4 h-4 mr-1" /> Neschvaluji
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin status change */}
      {isAdmin && order.status !== "completed" && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Změnit stav</p>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Poznámka ke změně stavu (volitelné)"
              value={statusNote}
              onChange={e => setStatusNote(e.target.value)}
            />
            <Button size="sm" onClick={changeStatus} disabled={newStatus === order.status}>
              Změnit stav
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Status timeline */}
      <ServiceStatusTimeline orderId={order.id} />

      {/* Handover Protocol */}
      <HandoverProtocol
        orderId={order.id}
        vehicleInfo={vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year || ""}` : undefined}
        isAdmin={isAdmin}
      />

      {/* Checkin (legacy) */}
      {isEnabled("service_checkin") && (
        <ServiceCheckinForm orderId={order.id} isAdmin={isAdmin} />
      )}

      {/* Photos */}
      {isEnabled("service_photos") && (
        <ServiceOrderPhotos orderId={order.id} isAdmin={isAdmin} />
      )}

      {/* Parts */}
      {isEnabled("service_parts") && (
        <ServiceOrderParts orderId={order.id} isAdmin={isAdmin} onTotalChange={async (total) => {
          await supabase.from("service_orders").update({ parts_total: total, total_price: (order.labor_price || 0) + total } as any).eq("id", order.id);
          fetchOrder();
        }} />
      )}

      {/* Mechanic tasks */}
      {isEnabled("mechanic_tasks") && (
        <ServiceOrderTasks orderId={order.id} isAdmin={isAdmin} />
      )}
    </div>
  );
};

export default ServiceOrderDetail;
