/**
 * AdminAuditLog — záznamy admin akcí.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { History, Search } from "lucide-react";

const AdminAuditLog = () => {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      setItems(data || []);
    })();
  }, []);

  const filtered = items.filter(
    (i) =>
      !search ||
      i.action.toLowerCase().includes(search.toLowerCase()) ||
      (i.entity_type || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.entity_id || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <History className="w-5 h-5 text-primary" /> Audit log
      </h2>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Hledat akci, entitu, ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Žádné záznamy.</CardContent></Card>
      )}

      <div className="space-y-1">
        {filtered.map((i) => (
          <Card key={i.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono font-bold text-primary">{i.action}</code>
                  {i.entity_type && <Badge variant="outline" className="text-[10px]">{i.entity_type}</Badge>}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(i.created_at).toLocaleString("cs-CZ")}
                </span>
              </div>
              {i.entity_id && <p className="text-[10px] text-muted-foreground mt-1">ID: {i.entity_id}</p>}
              {i.details && Object.keys(i.details).length > 0 && (
                <pre className="text-[10px] mt-1 p-2 bg-muted/30 rounded overflow-x-auto">
                  {JSON.stringify(i.details, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminAuditLog;
