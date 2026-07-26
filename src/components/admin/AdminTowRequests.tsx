import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, MapPin, Phone, Users } from "lucide-react";
import { ArchiveInlineButton } from "@/components/admin/common/ArchiveInlineButton";

type Row = {
  id: string;
  user_id: string;
  vehicle_info: string;
  problem_type: string;
  phone: string;
  passengers: number;
  latitude: number | null;
  longitude: number | null;
  location_text: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  profile_name?: string | null;
  profile_email?: string | null;
};

const STATUSES = ["new", "accepted", "dispatched", "completed", "cancelled"];

const AdminTowRequests = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Row | null>(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [sp, setSp] = useSearchParams();
  const focusId = sp.get("id");

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tow_requests")
      .select("*")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    const list = (data as Row[]) || [];
    const ids = [...new Set(list.map((r) => r.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids);
      const m = new Map((profs || []).map((p: any) => [p.user_id, p]));
      list.forEach((r) => {
        r.profile_name = m.get(r.user_id)?.full_name ?? null;
        r.profile_email = m.get(r.user_id)?.email ?? null;
      });
    }
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (focusId && rows.length) {
      const row = rows.find((r) => r.id === focusId);
      if (row) openEdit(row);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, rows.length]);

  const openEdit = (r: Row) => { setEdit(r); setStatus(r.status); setNote(r.admin_note || ""); };
  const closeEdit = () => {
    setEdit(null);
    if (sp.get("id")) { sp.delete("id"); setSp(sp, { replace: true }); }
  };
  const save = async () => {
    if (!edit) return;
    const { error } = await supabase.from("tow_requests").update({ status, admin_note: note }).eq("id", edit.id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Uloženo" });
    closeEdit();
    fetchAll();
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Žádosti o odtah</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Žádné žádosti</p>}
      {rows.map((r) => (
        <Card key={r.id} className="cursor-pointer hover:border-primary/40" onClick={() => openEdit(r)}>
          <CardContent className="p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{r.vehicle_info}</p>
              <p className="text-xs text-primary">{r.profile_name || "—"} · {r.profile_email || "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{r.problem_type}</p>
              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground mt-1">
                <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {r.phone}</span>
                <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {r.passengers}</span>
                {r.latitude != null && r.longitude != null && (
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString("cs-CZ")}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge>{r.status}</Badge>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
                Detail
              </Button>
              <ArchiveInlineButton table="tow_requests" id={r.id} onDone={fetchAll} />
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!edit} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Odtah — detail</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Zákazník:</span> {edit.profile_name || "—"} ({edit.profile_email || "—"})</div>
              <div><span className="text-muted-foreground">Vozidlo:</span> {edit.vehicle_info}</div>
              <div><span className="text-muted-foreground">Porucha:</span> {edit.problem_type}</div>
              <div><span className="text-muted-foreground">Telefon:</span> <a className="text-primary underline" href={`tel:${edit.phone}`}>{edit.phone}</a></div>
              <div><span className="text-muted-foreground">Osob:</span> {edit.passengers}</div>
              {edit.latitude != null && edit.longitude != null && (
                <div>
                  <a className="text-primary underline" target="_blank" rel="noreferrer"
                     href={`https://www.google.com/maps?q=${edit.latitude},${edit.longitude}`}>
                    Otevřít polohu na mapě ({edit.latitude.toFixed(5)}, {edit.longitude.toFixed(5)})
                  </a>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">Stav</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Poznámka pro zákazníka</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            {edit && <ArchiveInlineButton table="tow_requests" id={edit.id} onDone={() => { closeEdit(); fetchAll(); }} />}
            <Button variant="outline" onClick={closeEdit}>Zavřít</Button>
            <Button onClick={save}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTowRequests;
