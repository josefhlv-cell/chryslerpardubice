import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Users, Plus, Loader2, UserCog, Trash2 } from "lucide-react";

type Employee = {
  id: string;
  user_id: string | null;
  name: string;
  role: string;
  email: string | null;
  active: boolean;
  created_at: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrátor",
  mechanic: "Mechanik",
  parts_sales: "Prodej dílů",
  car_sales: "Prodej vozů",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  mechanic: "bg-blue-100 text-blue-800",
  parts_sales: "bg-green-100 text-green-800",
  car_sales: "bg-purple-100 text-purple-800",
};

const AdminEmployees = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState("mechanic");

  const fetchEmployees = async () => {
    setLoading(true);
    const { data } = await supabase.from("employees").select("*").order("created_at");
    setEmployees((data as Employee[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const addEmployee = async () => {
    if (!formName || !formRole) return;

    const { error } = await supabase.from("employees").insert({
      name: formName,
      email: formEmail || null,
      role: formRole,
    } as any);

    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }

    // If mechanic, also create a mechanics record
    if (formRole === "mechanic") {
      const { data: newEmp } = await supabase
        .from("employees")
        .select("id")
        .eq("name", formName)
        .eq("role", "mechanic")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (newEmp) {
        await supabase.from("mechanics").insert({
          name: formName,
          employee_id: newEmp.id,
          active: true,
        } as any);
      }
    }

    toast({ title: "Zaměstnanec přidán" });
    setShowAdd(false);
    setFormName("");
    setFormEmail("");
    setFormRole("mechanic");
    fetchEmployees();
  };

  const toggleActive = async (emp: Employee) => {
    await supabase.from("employees").update({ active: !emp.active } as any).eq("id", emp.id);
    toast({ title: emp.active ? "Deaktivován" : "Aktivován" });
    fetchEmployees();
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Zaměstnanci
        </h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1" /> Přidat
        </Button>
      </div>

      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Žádní zaměstnanci</p>
      ) : (
        employees.map(emp => (
          <Card key={emp.id} className={!emp.active ? "opacity-50" : ""}>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserCog className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{emp.name}</p>
                  <p className="text-xs text-muted-foreground">{emp.email || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={ROLE_COLORS[emp.role] || ""}>{ROLE_LABELS[emp.role] || emp.role}</Badge>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(emp)}>
                  {emp.active ? "Deaktivovat" : "Aktivovat"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nový zaměstnanec</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Jméno *</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Jan Novák" />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="jan@firma.cz" />
            </div>
            <div>
              <label className="text-sm font-medium">Role *</label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Zrušit</Button>
            <Button onClick={addEmployee}>Přidat zaměstnance</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEmployees;
