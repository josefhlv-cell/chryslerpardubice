import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Users, Plus, Loader2 } from "lucide-react";

type Mechanic = { id: string; name: string; specialization: string | null; active: boolean };
type Lift = { id: string; name: string; location: string | null; status: string };

const SPECS = ["diagnostika", "motor", "převodovky", "elektronika", "karoserie", "podvozek"];
const LIFT_STATUSES: Record<string, string> = { free: "Volný", occupied: "Obsazený", maintenance: "Mimo provoz" };

const AdminMechanics = () => {
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [lifts, setLifts] = useState<Lift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMech, setShowAddMech] = useState(false);
  const [showAddLift, setShowAddLift] = useState(false);
  const [mechName, setMechName] = useState("");
  const [mechSpec, setMechSpec] = useState("");
  const [liftName, setLiftName] = useState("");
  const [liftLocation, setLiftLocation] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    const [mechRes, liftRes] = await Promise.all([
      supabase.from("mechanics").select("*").order("created_at"),
      supabase.from("service_lifts").select("*").order("created_at"),
    ]);
    setMechanics((mechRes.data as Mechanic[]) || []);
    setLifts((liftRes.data as Lift[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const addMechanic = async () => {
    if (!mechName) return;
    await supabase.from("mechanics").insert({ name: mechName, specialization: mechSpec || null } as any);
    toast({ title: "Mechanik přidán" });
    setMechName(""); setMechSpec(""); setShowAddMech(false);
    fetchAll();
  };

  const toggleMechanic = async (id: string, active: boolean) => {
    await supabase.from("mechanics").update({ active: !active } as any).eq("id", id);
    fetchAll();
  };

  const addLift = async () => {
    if (!liftName) return;
    await supabase.from("service_lifts").insert({ name: liftName, location: liftLocation || null } as any);
    toast({ title: "Zvedák přidán" });
    setLiftName(""); setLiftLocation(""); setShowAddLift(false);
    fetchAll();
  };

  const updateLiftStatus = async (id: string, status: string) => {
    await supabase.from("service_lifts").update({ status } as any).eq("id", id);
    fetchAll();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Mechanics */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Mechanici
          </h3>
          <Button size="sm" onClick={() => setShowAddMech(true)}><Plus className="w-3 h-3 mr-1" /> Přidat</Button>
        </div>
        {mechanics.map(m => (
          <Card key={m.id} className="mb-2">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                {m.specialization && <Badge variant="outline" className="text-[10px]">{m.specialization}</Badge>}
              </div>
              <Switch checked={m.active} onCheckedChange={() => toggleMechanic(m.id, m.active)} />
            </CardContent>
          </Card>
        ))}
        {mechanics.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Žádní mechanici</p>}
      </div>

      {/* Lifts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-sm">Zvedáky</h3>
          <Button size="sm" onClick={() => setShowAddLift(true)}><Plus className="w-3 h-3 mr-1" /> Přidat</Button>
        </div>
        {lifts.map(l => (
          <Card key={l.id} className="mb-2">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{l.name}</p>
                {l.location && <p className="text-xs text-muted-foreground">{l.location}</p>}
              </div>
              <Select value={l.status} onValueChange={(v) => updateLiftStatus(l.id, v)}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LIFT_STATUSES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        ))}
        {lifts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Žádné zvedáky</p>}
      </div>

      {/* Add mechanic dialog */}
      <Dialog open={showAddMech} onOpenChange={setShowAddMech}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nový mechanik</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Jméno" value={mechName} onChange={e => setMechName(e.target.value)} />
            <Select value={mechSpec} onValueChange={setMechSpec}>
              <SelectTrigger><SelectValue placeholder="Specializace" /></SelectTrigger>
              <SelectContent>
                {SPECS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMech(false)}>Zrušit</Button>
            <Button onClick={addMechanic}>Přidat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add lift dialog */}
      <Dialog open={showAddLift} onOpenChange={setShowAddLift}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nový zvedák</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Název" value={liftName} onChange={e => setLiftName(e.target.value)} />
            <Input placeholder="Umístění" value={liftLocation} onChange={e => setLiftLocation(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLift(false)}>Zrušit</Button>
            <Button onClick={addLift}>Přidat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMechanics;
