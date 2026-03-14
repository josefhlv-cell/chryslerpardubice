import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Users, Plus, Loader2, UserCog, Pencil } from "lucide-react";

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
  admin: "bg-primary/15 text-primary border-0",
  mechanic: "bg-blue-500/15 text-blue-400 border-0",
  parts_sales: "bg-success/15 text-success border-0",
  car_sales: "bg-purple-500/15 text-purple-400 border-0",
};

const AdminEmployees = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
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

  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormRole("mechanic");
  };

  const openAdd = () => {
    resetForm();
    setEditEmployee(null);
    setShowAdd(true);
  };

  const openEdit = (emp: Employee) => {
    setFormName(emp.name);
    setFormEmail(emp.email || "");
    setFormRole(emp.role);
    setEditEmployee(emp);
    setShowAdd(true);
  };

  const closeDialog = () => {
    setShowAdd(false);
    setEditEmployee(null);
    resetForm();
  };

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
    closeDialog();
    fetchEmployees();
  };

  const saveEmployee = async () => {
    if (!editEmployee || !formName || !formRole) return;

    const { error } = await supabase.from("employees").update({
      name: formName,
      email: formEmail || null,
      role: formRole,
    } as any).eq("id", editEmployee.id);

    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }

    // If role changed to/from mechanic, handle mechanics table
    if (editEmployee.role !== formRole) {
      if (editEmployee.role === "mechanic") {
        // Deactivate mechanic record
        await supabase.from("mechanics").update({ active: false } as any).eq("employee_id", editEmployee.id);
      }
      if (formRole === "mechanic") {
        // Check if mechanic record exists
        const { data: existing } = await supabase.from("mechanics").select("id").eq("employee_id", editEmployee.id).maybeSingle();
        if (existing) {
          await supabase.from("mechanics").update({ active: true, name: formName } as any).eq("employee_id", editEmployee.id);
        } else {
          await supabase.from("mechanics").insert({
            name: formName,
            employee_id: editEmployee.id,
            active: true,
          } as any);
        }
      }
    } else if (formRole === "mechanic" && editEmployee.name !== formName) {
      // Update mechanic name if changed
      await supabase.from("mechanics").update({ name: formName } as any).eq("employee_id", editEmployee.id);
    }

    toast({ title: "Zaměstnanec upraven" });
    closeDialog();
    fetchEmployees();
  };

  const toggleActive = async (emp: Employee) => {
    await supabase.from("employees").update({ active: !emp.active } as any).eq("id", emp.id);
    // Also toggle mechanic if applicable
    if (emp.role === "mechanic") {
      await supabase.from("mechanics").update({ active: !emp.active } as any).eq("employee_id", emp.id);
    }
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
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> Přidat
        </Button>
      </div>

      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Žádní zaměstnanci</p>
      ) : (
        employees.map(emp => (
          <Card key={emp.id} className={`transition-all ${!emp.active ? "opacity-50" : "hover:border-primary/20"}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <UserCog className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{emp.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{emp.email || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={ROLE_COLORS[emp.role] || ""}>{ROLE_LABELS[emp.role] || emp.role}</Badge>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(emp)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(emp)} className="text-xs">
                    {emp.active ? "Deaktivovat" : "Aktivovat"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editEmployee ? "Upravit zaměstnance" : "Nový zaměstnanec"}</DialogTitle>
          </DialogHeader>
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
            <Button variant="outline" onClick={closeDialog}>Zrušit</Button>
            <Button onClick={editEmployee ? saveEmployee : addEmployee}>
              {editEmployee ? "Uložit změny" : "Přidat zaměstnance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEmployees;
