import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Play, CheckCircle2, Clock, Car, Wrench, Camera, Loader2 } from "lucide-react";

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

const STATUS_MAP: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "Čeká", icon: Clock, color: "bg-yellow-100 text-yellow-800" },
  in_progress: { label: "Probíhá", icon: Play, color: "bg-blue-100 text-blue-800" },
  completed: { label: "Hotovo", icon: CheckCircle2, color: "bg-green-100 text-green-800" },
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

    // Find employee record for this user
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

    // Find mechanic linked to employee
    const { data: mechData } = await supabase
      .from("mechanics")
      .select("*")
      .eq("employee_id", empData.id)
      .eq("active", true)
      .maybeSingle();

    setMechanic(mechData);

    if (!mechData) { setLoading(false); return; }

    // Get today's tasks for this mechanic
    const today = new Date().toISOString().split("T")[0];
    const { data: taskData } = await supabase
      .from("mechanic_tasks")
      .select("*")
      .eq("mechanic_id", mechData.id)
      .order("created_at", { ascending: true });

    const allTasks = (taskData as Task[]) || [];
    setTasks(allTasks);

    // Fetch related orders
    const orderIds = [...new Set(allTasks.map(t => t.service_order_id))];
    if (orderIds.length > 0) {
      const { data: orderData } = await supabase
        .from("service_orders")
        .select("id, description, planned_work, status, vehicle_id, mileage")
        .in("id", orderIds);
      
      const ordersMap: Record<string, OrderInfo> = {};
      (orderData || []).forEach((o: any) => { ordersMap[o.id] = o; });
      setOrders(ordersMap);

      // Fetch vehicles
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

  // Subscribe to real-time task changes
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

    // Create work report
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
      // Find the task's order and add photo
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
      <div className="min-h-screen pb-20">
        <PageHeader title="Dashboard mechanika" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!employee || employee.role !== "mechanic") {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Dashboard mechanika" />
        <div className="p-4 text-center py-12">
          <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nemáte přiřazenou roli mechanika.</p>
        </div>
      </div>
    );
  }

  const activeTasks = tasks.filter(t => t.status !== "completed");
  const completedTasks = tasks.filter(t => t.status === "completed");

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Moje úkoly" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-display font-semibold">{employee.name}</p>
            <p className="text-xs text-muted-foreground">
              {activeTasks.length} aktivních úkolů · {completedTasks.length} dokončeno
            </p>
          </div>
        </div>

        {activeTasks.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Žádné aktivní úkoly</p>
            </CardContent>
          </Card>
        )}

        {activeTasks.map(task => {
          const order = orders[task.service_order_id];
          const vehicle = order?.vehicle_id ? vehicles[order.vehicle_id] : null;
          const statusInfo = STATUS_MAP[task.status] || STATUS_MAP.pending;
          const Icon = statusInfo.icon;

          return (
            <Card key={task.id} className="border-l-4 border-l-primary">
              <CardContent className="p-4 space-y-3">
                {/* Vehicle info */}
                {vehicle && (
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">
                      {vehicle.brand} {vehicle.model} {vehicle.year || ""}
                    </span>
                    {vehicle.license_plate && (
                      <Badge variant="outline" className="text-xs">{vehicle.license_plate}</Badge>
                    )}
                  </div>
                )}

                {/* Task info */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{task.title}</p>
                    {order?.description && (
                      <p className="text-xs text-muted-foreground mt-1">{order.description}</p>
                    )}
                    {task.estimated_minutes && (
                      <p className="text-xs text-muted-foreground">⏱ {task.estimated_minutes} min</p>
                    )}
                  </div>
                  <Badge className={statusInfo.color}>
                    <Icon className="w-3 h-3 mr-1" />
                    {statusInfo.label}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  {task.status === "pending" && (
                    <Button size="sm" className="w-full" onClick={() => startTask(task)}>
                      <Play className="w-4 h-4 mr-1" /> Začít práci
                    </Button>
                  )}

                  {task.status === "in_progress" && (
                    <>
                      <Textarea
                        placeholder="Poznámka k dokončení (volitelné)"
                        value={completionNote[task.id] || ""}
                        onChange={e => setCompletionNote(prev => ({ ...prev, [task.id]: e.target.value }))}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" asChild>
                          <label className="cursor-pointer">
                            <Camera className="w-4 h-4 mr-1" />
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
                        <Button size="sm" className="flex-1" onClick={() => completeTask(task)}>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Dokončit práci
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Completed today */}
        {completedTasks.length > 0 && (
          <>
            <p className="text-xs font-semibold text-muted-foreground pt-2">Dokončené úkoly</p>
            {completedTasks.map(task => {
              const order = orders[task.service_order_id];
              const vehicle = order?.vehicle_id ? vehicles[order.vehicle_id] : null;
              return (
                <Card key={task.id} className="opacity-60">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium line-through">{task.title}</p>
                        {vehicle && <p className="text-xs text-muted-foreground">{vehicle.brand} {vehicle.model}</p>}
                      </div>
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Hotovo
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default MechanicDashboard;
