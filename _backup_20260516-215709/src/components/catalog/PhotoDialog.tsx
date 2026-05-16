/**
 * PhotoDialog Component
 * Modal for displaying part photos. Photos are NOT loaded automatically —
 * they load only when this dialog is opened.
 */

import { Loader2, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PhotoDialogProps {
  open: boolean;
  oem: string;
  loading: boolean;
  urls: string[];
  onOpenChange: (open: boolean) => void;
}

const PhotoDialog = ({ open, oem, loading, urls, onOpenChange }: PhotoDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-mono text-sm">Fotografie — {oem}</DialogTitle>
      </DialogHeader>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Načítám z katalogu...</span>
        </div>
      ) : urls.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {urls.map((url, i) => (
            <img key={i} src={url} alt={`${oem} foto ${i + 1}`} className="w-full rounded-lg border border-border" loading="lazy" />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Fotografie zatím není k dispozici</p>
          <p className="text-[10px] text-muted-foreground mt-1">Bude dostupná po propojení s Mopar EPC</p>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

export default PhotoDialog;
