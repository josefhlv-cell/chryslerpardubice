import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Universal soft-delete / restore / hard-delete hook for archivable admin tables.
 * `archived_at` is a shared column on all supported tables (see migration).
 */
export type ArchivableTable =
  | "orders"
  | "service_orders"
  | "service_bookings"
  | "tow_requests"
  | "vehicle_buyback_requests"
  | "vehicle_import_requests"
  | "used_part_requests"
  | "new_part_orders"
  | "vehicle_inquiries"
  | "fault_reports"
  | "support_conversations"
  | "jm_orders";

export function useArchive(table: ArchivableTable, onChanged?: () => void) {
  const [busy, setBusy] = useState(false);

  const archive = useCallback(
    async (id: string) => {
      setBusy(true);
      const { error } = await supabase
        .from(table as any)
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      setBusy(false);
      if (error) {
        toast({ title: "Chyba archivace", description: error.message, variant: "destructive" });
        return false;
      }
      toast({ title: "Archivováno", description: "Přesunuto do sekce Vyřízené." });
      onChanged?.();
      return true;
    },
    [table, onChanged]
  );

  const restore = useCallback(
    async (id: string) => {
      setBusy(true);
      const { error } = await supabase
        .from(table as any)
        .update({ archived_at: null })
        .eq("id", id);
      setBusy(false);
      if (error) {
        toast({ title: "Chyba obnovy", description: error.message, variant: "destructive" });
        return false;
      }
      toast({ title: "Obnoveno" });
      onChanged?.();
      return true;
    },
    [table, onChanged]
  );

  const hardDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Trvale smazat záznam? Akce je nevratná.")) return false;
      setBusy(true);
      const { error } = await supabase.from(table as any).delete().eq("id", id);
      setBusy(false);
      if (error) {
        toast({ title: "Chyba mazání", description: error.message, variant: "destructive" });
        return false;
      }
      toast({ title: "Trvale smazáno" });
      onChanged?.();
      return true;
    },
    [table, onChanged]
  );

  return { archive, restore, hardDelete, busy };
}
