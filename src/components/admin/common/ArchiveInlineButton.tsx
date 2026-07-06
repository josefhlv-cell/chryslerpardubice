import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArchive, ArchivableTable } from "@/hooks/useArchive";

interface ArchiveInlineButtonProps {
  table: ArchivableTable;
  id: string;
  onDone?: () => void;
  label?: string;
  className?: string;
}

/**
 * Small inline "Archivovat" button used inside admin list rows.
 * Stops click propagation so it doesn't trigger the row detail dialog.
 */
export function ArchiveInlineButton({
  table,
  id,
  onDone,
  label = "Archivovat",
  className,
}: ArchiveInlineButtonProps) {
  const { archive, busy } = useArchive(table, onDone);

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={className ?? "h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        if (window.confirm("Přesunout do sekce Vyřízené?")) {
          void archive(id);
        }
      }}
    >
      <Archive className="h-3 w-3 mr-1" />
      {label}
    </Button>
  );
}

export default ArchiveInlineButton;
