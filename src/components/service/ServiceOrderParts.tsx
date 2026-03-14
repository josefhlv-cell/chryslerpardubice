import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Package, Plus, Trash2 } from "lucide-react";

type OrderPart = {
  id: string;
  name: string;
  oem_number: string | null;
  price: number;
  quantity: number;
  part_id: string | null;
};

interface Props {
  orderId: string;
  isAdmin: boolean;
  onTotalChange: (total: number) => void;
}

const ServiceOrderParts = ({ orderId, isAdmin, onTotalChange }: Props) => {
  const [parts, setParts] = useState<OrderPart[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [oem, setOem] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchParts = async () => {
    const { data } = await supabase
      .from("service_order_parts")
      .select("*")
      .eq("service_order_id", orderId)
      .order("created_at");
    const items = (data as OrderPart[]) || [];
    setParts(items);
    const total = items.reduce((s, p) => s + p.price * p.quantity, 0);
    onTotalChange(total);
  };

  useEffect(() => { fetchParts(); }, [orderId]);

  const searchCatalog = async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("parts_new")
      .select("id, name, oem_number, price_with_vat")
      .or(`name.ilike.%${query}%,oem_number.ilike.%${query}%`)
      .limit(5);
    setSearchResults(data || []);
    setSearching(false);
  };

  const addFromCatalog = (part: any) => {
    setName(part.name);
    setOem(part.oem_number);
    setPrice(part.price_with_vat?.toString() || "0");
    setSearchResults([]);
  };

  const addPart = async () => {
    if (!name) { toast({ title: "Zadejte název dílu", variant: "destructive" }); return; }
    await supabase.from("service_order_parts").insert({
      service_order_id: orderId,
      name,
      oem_number: oem || null,
      price: parseFloat(price) || 0,
      quantity: parseInt(qty) || 1,
    } as any);
    toast({ title: "Díl přidán" });
    setName(""); setOem(""); setPrice(""); setQty("1");
    setShowAdd(false);
    fetchParts();
  };

  const removePart = async (id: string) => {
    await supabase.from("service_order_parts").delete().eq("id", id);
    fetchParts();
  };

  const total = parts.reduce((s, p) => s + p.price * p.quantity, 0);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" /> Použité díly
          </p>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="w-3 h-3 mr-1" /> Přidat díl
            </Button>
          )}
        </div>

        {parts.length === 0 && !showAdd && (
          <p className="text-xs text-muted-foreground">Žádné díly</p>
        )}

        {parts.map(p => (
          <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{p.name}</p>
              {p.oem_number && <p className="text-[10px] text-muted-foreground">{p.oem_number}</p>}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span>{p.quantity}× {p.price.toLocaleString("cs")} Kč</span>
              {isAdmin && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removePart(p.id)}>
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        ))}

        {parts.length > 0 && (
          <p className="text-xs font-semibold text-right mt-2">Celkem díly: {total.toLocaleString("cs")} Kč</p>
        )}

        {showAdd && isAdmin && (
          <div className="space-y-2 mt-3 p-3 bg-secondary/30 rounded-lg">
            <div>
              <Input
                placeholder="Hledat v katalogu nebo zadat název..."
                value={name}
                onChange={e => { setName(e.target.value); searchCatalog(e.target.value); }}
              />
              {searchResults.length > 0 && (
                <div className="border rounded mt-1 max-h-32 overflow-y-auto">
                  {searchResults.map(r => (
                    <div key={r.id} className="px-2 py-1.5 text-xs hover:bg-secondary/50 cursor-pointer"
                      onClick={() => addFromCatalog(r)}>
                      {r.name} · {r.oem_number} · {r.price_with_vat?.toLocaleString("cs")} Kč
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="OEM" value={oem} onChange={e => setOem(e.target.value)} />
              <Input type="number" placeholder="Cena" value={price} onChange={e => setPrice(e.target.value)} />
              <Input type="number" placeholder="Ks" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
            <Button size="sm" onClick={addPart} className="w-full">Přidat díl</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceOrderParts;
