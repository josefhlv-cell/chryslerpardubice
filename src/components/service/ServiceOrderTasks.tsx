import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ListTodo, Plus, CheckCircle2, Clock, Play } from "lucide-react";

type Task = {
  id: string;
  title: string;
  status: string;
  estimated_minutes: number | null;
  mechanic_id: string | null;
  completed_at: string | null;
};

type Mechanic = { id: string; name: string; specialization: string | null; active: boolean };

const TASK_STATUS: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "Čeká", icon: Clock, color: "bg-yellow-100 text-yellow-800" },
  in_progress: { label: "Probíhá", icon: Play, color: "bg-blue-100 text-blue-800" },
  completed: { label: "Hotovo", icon: CheckCircle2, color: "bg-green-100 text-green-800" },
};

const COMMON_TASKS = ["Diagnostika", "Výměna oleje", "Výměna filtrů", "Výměna brzd", "Testovací jízda", "Geometrie", "Klimatizace", "Elektrika"];

const ServiceOrderTasks = ({ orderId, isAdmin }: { orderId: string; isAdmin: boolean }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [mechId, setMechId] = useState("");
  const [estMins, setEstMins] = useState("");

  const fetchTasks = async () => {
    const [tasksRes, mechRes] = await Promise.all([
      supabase.from("mechanic_tasks").select("*").eq("service_order_id", orderId).order("created_at"),
      supabase.from("mechanics").select("*").eq("active", true),
    ]);
    setTasks((tasksRes.data as Task[]) || []);
    setMechanics((mechRes.data as Mechanic[]) || []);
  };

  useEffect(() => {
    fetchTasks();

    const channel = supabase
      .channel(`tasks-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mechanic_tasks", filter: `service_order_id=eq.${orderId}` }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  const addTask = async () => {
    if (!title) return;
    await supabase.from("mechanic_tasks").insert({
      service_order_id: orderId,
      title,
      mechanic_id: mechId || null,
      estimated_minutes: estMins ? parseInt(estMins) : null,
    } as any);
    setTitle(""); setMechId(""); setEstMins("");
    setShowAdd(false);
    fetchTasks();
  };

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    const update: any = { status: newStatus };
    if (newStatus === "completed") update.completed_at = new Date().toISOString();
    await supabase.from("mechanic_tasks").update(update).eq("id", taskId);
    fetchTasks();
  };

  const getMechanicName = (id: string | null) => {
    if (!id) return null;
    return mechanics.find(m => m.id === id)?.name || null;
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-primary" /> Úkoly
          </p>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="w-3 h-3 mr-1" /> Přidat úkol
            </Button>
          )}
        </div>

        {tasks.length === 0 && !showAdd && (
          <p className="text-xs text-muted-foreground">Žádné úkoly</p>
        )}

        <div className="space-y-2">
          {tasks.map(t => {
            const status = TASK_STATUS[t.status] || TASK_STATUS.pending;
            const Icon = status.icon;
            return (
              <div key={t.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{t.title}</p>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      {getMechanicName(t.mechanic_id) && <span>{getMechanicName(t.mechanic_id)}</span>}
                      {t.estimated_minutes && <span>{t.estimated_minutes} min</span>}
                    </div>
                  </div>
                </div>
                {isAdmin && t.status !== "completed" ? (
                  <Select value={t.status} onValueChange={(v) => updateTaskStatus(t.id, v)}>
                    <SelectTrigger className="h-7 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_STATUS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge className={`text-[10px] ${status.color}`}>{status.label}</Badge>
                )}
              </div>
            );
          })}
        </div>

        {showAdd && isAdmin && (
          <div className="space-y-2 mt-3 p-3 bg-secondary/30 rounded-lg">
            <div className="flex gap-1 flex-wrap mb-2">
              {COMMON_TASKS.map(t => (
                <Button key={t} variant="outline" size="sm" className="text-[10px] h-6" onClick={() => setTitle(t)}>
                  {t}
                </Button>
              ))}
            </div>
            <Input placeholder="Název úkolu" value={title} onChange={e => setTitle(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Select value={mechId} onValueChange={setMechId}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Mechanik" /></SelectTrigger>
                <SelectContent>
                  {mechanics.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Čas (min)" value={estMins} onChange={e => setEstMins(e.target.value)} />
            </div>
            <Button size="sm" onClick={addTask} className="w-full">Přidat úkol</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceOrderTasks;
