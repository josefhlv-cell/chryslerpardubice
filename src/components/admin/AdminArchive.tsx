import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Archive,
  Eye,
  RotateCcw,
  Trash2,
  RefreshCw,
  ShoppingCart,
  Wrench,
  Calendar,
  Car,
  AlertTriangle,
  MessageCircle,
  Package,
  ArrowDownUp,
} from "lucide-react";
import { CollapsibleAdminSection } from "@/components/admin/common/CollapsibleAdminSection";
import { useArchive, ArchivableTable } from "@/hooks/useArchive";

type Row = { id: string; archived_at?: string | null; [k: string]: any };

interface ArchiveSectionConfig {
  key: ArchivableTable;
  title: string;
  icon: React.ReactNode;
  columns: string;
  orderBy?: string;
  render: (r: Row) => React.ReactNode;
}

const CONFIGS: ArchiveSectionConfig[] = [
  {
    key: "orders",
    title: "Objednávky dílů",
    icon: <ShoppingCart className="h-4 w-4" />,
    columns: "id, part_name, oem_number, status, price_with_vat, quantity, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">{r.part_name || "—"}</div>
        <div className="text-xs text-muted-foreground">
          OEM: {r.oem_number || "—"} · {r.quantity}× · {r.price_with_vat ?? 0} Kč
        </div>
      </>
    ),
  },
  {
    key: "service_orders",
    title: "Servisní zakázky",
    icon: <Wrench className="h-4 w-4" />,
    columns: "id, description, planned_work, status, total_price, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">
          Servis #{r.id.slice(0, 8)}
        </div>
        <div className="text-xs text-muted-foreground">
          {r.description || r.planned_work || "—"} · {r.total_price ?? 0} Kč
        </div>
      </>
    ),
  },
  {
    key: "service_bookings",
    title: "Rezervace servisu",
    icon: <Calendar className="h-4 w-4" />,
    columns: "id, service_type, vehicle_brand, vehicle_model, preferred_date, status, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">{r.service_type || "—"}</div>
        <div className="text-xs text-muted-foreground">
          {r.vehicle_brand || ""} {r.vehicle_model || ""} · {r.preferred_date || "—"}
        </div>
      </>
    ),
  },
  {
    key: "tow_requests",
    title: "Odtahy",
    icon: <AlertTriangle className="h-4 w-4" />,
    columns: "id, vehicle_info, problem_type, phone, status, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">{r.vehicle_info || "—"}</div>
        <div className="text-xs text-muted-foreground">
          {r.problem_type || "—"} · {r.phone || "—"}
        </div>
      </>
    ),
  },
  {
    key: "vehicle_buyback_requests",
    title: "Výkup vozů",
    icon: <ArrowDownUp className="h-4 w-4" />,
    columns: "id, brand, model, year, name, phone, email, status, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">
          {r.brand} {r.model} ({r.year})
        </div>
        <div className="text-xs text-muted-foreground">
          {r.name || "—"} · {r.phone || r.email || "—"}
        </div>
      </>
    ),
  },
  {
    key: "vehicle_import_requests",
    title: "Dovoz vozů",
    icon: <Car className="h-4 w-4" />,
    columns: "id, brand, model, name, phone, email, status, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">
          {r.brand} {r.model}
        </div>
        <div className="text-xs text-muted-foreground">
          {r.name || "—"} · {r.phone || r.email || "—"}
        </div>
      </>
    ),
  },
  {
    key: "used_part_requests",
    title: "Poptávky použitých dílů",
    icon: <Package className="h-4 w-4" />,
    columns: "id, part_name, vehicle_info, phone, status, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">{r.part_name || "—"}</div>
        <div className="text-xs text-muted-foreground">
          {r.vehicle_info || "—"} · {r.phone || "—"}
        </div>
      </>
    ),
  },
  {
    key: "new_part_orders",
    title: "Poptávky nových dílů",
    icon: <Package className="h-4 w-4" />,
    columns: "id, part_name, oem_number, customer_name, phone, status, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">
          {r.part_name || "—"} ({r.oem_number || "—"})
        </div>
        <div className="text-xs text-muted-foreground">
          {r.customer_name || "—"} · {r.phone || "—"}
        </div>
      </>
    ),
  },
  {
    key: "vehicle_inquiries",
    title: "Poptávky vozidel",
    icon: <Car className="h-4 w-4" />,
    columns: "id, name, email, phone, message, status, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">{r.name || "—"}</div>
        <div className="text-xs text-muted-foreground">
          {r.email || "—"} · {r.phone || "—"}
        </div>
      </>
    ),
  },
  {
    key: "fault_reports",
    title: "Hlášení závad",
    icon: <AlertTriangle className="h-4 w-4" />,
    columns: "id, vehicle_brand, vehicle_model, description, status, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">
          {r.vehicle_brand || ""} {r.vehicle_model || ""}
        </div>
        <div className="text-xs text-muted-foreground line-clamp-2">
          {r.description || "—"}
        </div>
      </>
    ),
  },
  {
    key: "support_conversations",
    title: "Konverzace podpory",
    icon: <MessageCircle className="h-4 w-4" />,
    columns: "id, subject, last_message_preview, status, archived_at, last_message_at, created_at",
    orderBy: "last_message_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">{r.subject || "Bez tématu"}</div>
        <div className="text-xs text-muted-foreground line-clamp-1">
          {r.last_message_preview || "—"}
        </div>
      </>
    ),
  },
  {
    key: "jm_orders",
    title: "Odeslané do J+M",
    icon: <Package className="h-4 w-4" />,
    columns: "id, order_id, nextis_order_id, status, archived_at, created_at",
    render: (r) => (
      <>
        <div className="font-medium text-sm">
          J+M #{r.nextis_order_id || r.id.slice(0, 8)}
        </div>
        <div className="text-xs text-muted-foreground">Interní: {r.order_id || "—"}</div>
      </>
    ),
  },
];

function ArchiveSection({ config }: { config: ArchiveSectionConfig }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const { restore, hardDelete, busy } = useArchive(config.key, () => load());

  const load = useCallback(async () => {
    setLoading(true);
    const orderCol = config.orderBy || "archived_at";
    const { data, error } = await supabase
      .from(config.key as any)
      .select("*")
      .not("archived_at", "is", null)
      .order(orderCol as any, { ascending: false })
      .limit(200);
    setLoading(false);
    if (!error) setRows((data as any) || []);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <CollapsibleAdminSection
        title={config.title}
        count={rows.length}
        icon={config.icon}
        actions={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              load();
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      >
        {loading && rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Načítám…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nic archivovaného.</p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-2 p-2 rounded border border-border/40 bg-card"
            >
              <div className="min-w-0 flex-1">
                {config.render(r)}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {r.status && (
                    <Badge variant="outline" className="text-[10px]">
                      {r.status}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    Archivováno {r.archived_at ? new Date(r.archived_at).toLocaleString("cs-CZ") : "—"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setDetail(r)}
                >
                  <Eye className="h-3 w-3 mr-1" /> Detail
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={busy}
                  onClick={() => restore(r.id)}
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Obnovit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => hardDelete(r.id)}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Smazat
                </Button>
              </div>
            </div>
          ))
        )}
      </CollapsibleAdminSection>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{config.title} — archivovaný detail</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              {Object.entries(detail).map(([key, value]) => {
                if (value === null || value === undefined || value === "") return null;
                const rendered = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
                return (
                  <div key={key} className="rounded-md border border-border/50 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground break-all">{key}</p>
                    <p className="whitespace-pre-wrap break-words">{rendered}</p>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            {detail && <Button variant="outline" disabled={busy} onClick={() => restore(detail.id)}><RotateCcw className="h-3 w-3 mr-1" />Obnovit</Button>}
            {detail && <Button variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => hardDelete(detail.id)}><Trash2 className="h-3 w-3 mr-1" />Trvale smazat</Button>}
            <Button onClick={() => setDetail(null)}>Zavřít</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminArchive() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
          <Archive className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-display font-semibold">Vyřízené</h1>
          <p className="text-xs text-muted-foreground">
            Archivované položky ze všech modulů. Sekce jsou při načtení zabalené — rozklikni podle
            potřeby. Obnov nebo trvale smaž jednotlivé záznamy.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {CONFIGS.map((cfg) => (
          <ArchiveSection key={cfg.key} config={cfg} />
        ))}
      </div>
    </div>
  );
}
