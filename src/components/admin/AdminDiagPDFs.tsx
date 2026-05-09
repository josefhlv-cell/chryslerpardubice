/**
 * AdminDiagPDFs — generování diagnostických protokolů PDF.
 * Volá edge funkci `diag-protocol-pdf`, vrátí signed URL ke stažení.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileDown, Loader2, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const AdminDiagPDFs = () => {
  const [vin, setVin] = useState("");
  const [customer, setCustomer] = useState("");
  const [dtcs, setDtcs] = useState("P0420\nP0171");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("diag-protocol-pdf", {
        body: {
          vin,
          customer_name: customer,
          dtcs: dtcs.split("\n").map((s) => s.trim()).filter(Boolean),
          notes,
        },
      });
      if (error) throw error;
      setUrl(data?.url);
      toast({ title: "PDF vygenerováno" });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FileText className="w-5 h-5 text-primary" />
        Diagnostické protokoly (PDF)
      </h2>
      <p className="text-xs text-muted-foreground">
        Vygeneruje protokol pro zákazníka s VIN, DTC kódy a doporučeními. Lze stáhnout, vytisknout nebo poslat e-mailem.
      </p>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">VIN</label>
              <Input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} maxLength={17} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Zákazník</label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">DTC kódy (řádek = jeden kód)</label>
            <Textarea rows={4} value={dtcs} onChange={(e) => setDtcs(e.target.value)} className="font-mono text-xs" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Poznámky a doporučení</label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
            Vygenerovat PDF
          </Button>
          {url && (
            <div className="p-3 bg-success/10 border border-success/30 rounded">
              <a href={url} target="_blank" rel="noreferrer" className="text-sm text-success underline">
                📄 Stáhnout protokol
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDiagPDFs;
