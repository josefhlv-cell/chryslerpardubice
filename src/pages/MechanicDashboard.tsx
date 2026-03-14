import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Play, CheckCircle2, Clock, Car, Wrench, Camera, Loader2, Timer } from "lucide-react";
import { motion } from "framer-motion";
import ServiceProgressIndicator from "@/components/ServiceProgressIndicator";

type Task = {
  id: string;
  title: string;
  status: string;
  estimated_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  service_order_id: string;
  mechanic_id: string | null;
};

type OrderInfo = {
  id: string;
  description: string | null;
  planned_work: string | null;
  status: string;
  vehicle_id: string | null;
  mileage: number | null;
};

type VehicleInfo = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  license_plate: string | null;
};

const STATUS_MAP: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  pending: { label: "Čeká", icon: Clock, color: "text-warning", bg: "bg-warning/15" },
  in_progress: { label: "Probíhá", icon: Play, color: "text-primary", bg: "bg-primary/15" },
  completed: { label: "Hotovo", icon: CheckCircle2, color: "text-success", bg: "bg-success/15" },
};

const MechanicDashboard = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [orders, setOrders] = useState<Record<string, OrderInfo>>({});
  const [vehicles, setVehicles] = useState<Record<string, VehicleInfo>>({});
  const [employee, setEmployee] = useState<any>(null);
  const [mechanic, setMechanic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completionNote, setCompletionNote] = useState<Record<string, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    loadData();
  }, [user, authLoading]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: empData } = await supabase
      .from("employees")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!empData) {
      setLoading(false);
      return;
    }
    setEmployee(empData);

    const { data: mechData } = await supabase
      .from("mechanics")
      .select("*")
      .eq("employee_id", empData.id)
      .eq("active", true)
      .maybeSingle();

    setMechanic(mechData);

    if (!mechData) { setLoading(false); return; }

    const { data: taskData } = await supabase
      .from("mechanic_tasks")
      .select("*")
      .eq("mechanic_id", mechData.id)
      .order("created_at", { ascending: true });

    const allTasks = (taskData as Task[]) || [];
    setTasks(allTasks);

    const orderIds = [...new Set(allTasks.map(t => t.service_order_id))];
    if (orderIds.length > 0) {
      const { data: orderData } = await supabase
        .from("service_orders")
        .select("id, description, planned_work, status, vehicle_id, mileage")
        .in("id", orderIds);
      
      const ordersMap: Record<string, OrderInfo> = {};
      (orderData || []).forEach((o: any) => { ordersMap[o.id] = o; });
      setOrders(ordersMap);

      const vehicleIds = [...new Set((orderData || []).map((o: any) => o.vehicle_id).filter(Boolean))];
      if (vehicleIds.length > 0) {
        const { data: vData } = await supabase
          .from("user_vehicles")
          .select("id, brand, model, year, license_plate")
          .in("id", vehicleIds);
        
        const vMap: Record<string, VehicleInfo> = {};
        (vData || []).forEach((v: any) => { vMap[v.id] = v; });
        setVehicles(vMap);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!mechanic) return;
    const channel = supabase
      .channel(`mechanic-tasks-${mechanic.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "mechanic_tasks",
        filter: `mechanic_id=eq.${mechanic.id}`,
      }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mechanic?.id]);

  const startTask = async (task: Task) => {
    const now = new Date().toISOString();
    await supabase.from("mechanic_tasks").update({
      status: "in_progress",
      started_at: now,
    } as any).eq("id", task.id);
    toast({ title: "Práce zahájena" });
    loadData();
  };

  const completeTask = async (task: Task) => {
    const now = new Date().toISOString();
    await supabase.from("mechanic_tasks").update({
      status: "completed",
      completed_at: now,
    } as any).eq("id", task.id);

    await supabase.from("work_reports").insert({
      mechanic_id: mechanic.id,
      employee_id: employee.id,
      service_order_id: task.service_order_id,
      task_id: task.id,
      started_at: task.started_at || now,
      completed_at: now,
      note: completionNote[task.id] || null,
    } as any);

    toast({ title: "Úkol dokončen" });
    setCompletionNote(prev => ({ ...prev, [task.id]: "" }));
    loadData();
  };

  const handlePhotoUpload = async (taskId: string, file: File) => {
    setUploadingPhoto(taskId);
    const path = `mechanic-work/${mechanic.id}/${taskId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("service-order-photos").upload(path, file);
    if (error) {
      toast({ title: "Chyba nahrávání", description: error.message, variant: "destructive" });
    } else {
      const { data: urlData } = supabase.storage.from("service-order-photos").getPublicUrl(path);
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        await supabase.from("service_order_photos").insert({
          service_order_id: task.service_order_id,
          photo_url: urlData.publicUrl,
          phase: "during",
          description: `Mechanik: ${employee.name}`,
        } as any);
      }
      toast({ title: "Fotografie nahrána" });
    }
    setUploadingPhoto(null);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen pb-20 bg-background">
        <PageHeader title="Dashboard mechanika" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!employee || employee.role !== "mechanic") {
    return (
      <div className="min-h-screen pb-20 bg-background">
        <PageHeader title="Dashboard mechanika" />
        <div className="p-4 text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Wrench className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium">Nemáte přiřazenou roli mechanika.</p>
        </div>
      </div>
    );
  }

  const activeTasks = tasks.filter(t => t.status !== "completed");
  const completedTasks = tasks.filter(t => t.status === "completed");

  return (
    <div className="min-h-screen pb-20 bg-background">
      <PageHeader title="Moje úkoly" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* Mechanic header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card-elevated p-4 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Wrench className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-bold text-lg">{employee.name}</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Timer className="w-3 h-3" /> {activeTasks.length} aktivních
              </span>
              <span className="text-xs text-success flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {completedTasks.length} hotovo
              </span>
            </div>
          </div>
        </motion.div>

        {activeTasks.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-8 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-success" />
            </div>
            <p className="text-sm font-medium">Žádné aktivní úkoly</p>
            <p className="text-xs text-muted-foreground mt-1">Všechny úkoly jsou dokončeny</p>
          </motion.div>
        )}

        {activeTasks.map((task, i) => {
          const order = orders[task.service_order_id];
          const vehicle = order?.vehicle_id ? vehicles[order.vehicle_id] : null;
          const statusInfo = STATUS_MAP[task.status] || STATUS_MAP.pending;
          const Icon = statusInfo.icon;

          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card-elevated overflow-hidden"
            >
              {/* Status bar */}
              <div className={`h-1 ${task.status === "in_progress" ? "bg-primary" : "bg-warning"}`} />
              
              <div className="p-4 space-y-3">
                {/* Vehicle info */}
                {vehicle && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center">
                      <Car className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <span className="text-sm font-display font-semibold">
                        {vehicle.brand} {vehicle.model} {vehicle.year || ""}
                      </span>
                      {vehicle.license_plate && (
                        <p className="text-[10px] text-muted-foreground font-mono">{vehicle.license_plate}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Service progress */}
                {order && (
                  <ServiceProgressIndicator status={order.status} compact />
                )}

                {/* Task info */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-sm">{task.title}</p>
                    {order?.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{order.description}</p>
                    )}
                    {task.estimated_minutes && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Timer className="w-3 h-3" /> {task.estimated_minutes} min
                      </p>
                    )}
                  </div>
                  <Badge className={`${statusInfo.bg} ${statusInfo.color} border-0 font-medium`}>
                    <Icon className="w-3 h-3 mr-1" />
                    {statusInfo.label}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  {task.status === "pending" && (
                    <Button
                      size="lg"
                      className="w-full h-14 text-base font-display font-semibold rounded-xl"
                      onClick={() => startTask(task)}
                    >
                      <Play className="w-5 h-5 mr-2" /> Začít práci
                    </Button>
                  )}

                  {task.status === "in_progress" && (
                    <>
                      <Textarea
                        placeholder="Poznámka k dokončení (volitelné)"
                        value={completionNote[task.id] || ""}
                        onChange={e => setCompletionNote(prev => ({ ...prev, [task.id]: e.target.value }))}
                        className="text-sm rounded-xl bg-secondary/50 border-border/40 min-h-[80px]"
                      />
                      <div className="flex gap-2">
                        <Button size="lg" variant="outline" className="flex-1 h-12 rounded-xl border-border/60" asChild>
                          <label className="cursor-pointer">
                            <Camera className="w-4 h-4 mr-1.5" />
                            {uploadingPhoto === task.id ? "Nahrávám..." : "Foto"}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(task.id, file);
                              }}
                            />
                          </label>
                        </Button>
                        <Button size="lg" className="flex-1 h-12 rounded-xl font-display font-semibold" onClick={() => completeTask(task)}>
                          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Dokončit
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Completed */}
        {completedTasks.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-display font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Dokončené úkoly</p>
            <div className="space-y-2">
              {completedTasks.map((task, i) => {
                const order = orders[task.service_order_id];
                const vehicle = order?.vehicle_id ? vehicles[order.vehicle_id] : null;
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="glass-card p-3 opacity-60"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-through text-muted-foreground">{task.title}</p>
                        {vehicle && <p className="text-xs text-muted-foreground/60">{vehicle.brand} {vehicle.model}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 text-success text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Hotovo
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MechanicDashboard;
