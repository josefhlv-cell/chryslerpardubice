/**
 * Unified Catalog — 5-level Nextis drill-down.
 * Brand → Model → Engine → Category → Parts (OEM/Mopar locked to top).
 */
import { forwardRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft, Loader2, Car, Cog, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import {
  fetchBrands, fetchModelsForBrand, fetchEnginesForModel,
  fetchNextisVehicles, fetchJmCategoryTree, listPartsForVehicle,
  fetchJmByCodes, fetchJmForVehicle, mergeWithJm, partMatchesKeywords,
  type CatalogPart, type CatalogCategoryNode, type NextisVehicle,
} from "@/api/catalogV2API";
import { Input } from "@/components/ui/input";
import CatalogListing from "@/components/catalog/CatalogListing";
import GlobalOEMSearch from "@/components/catalog/GlobalOEMSearch";

const Catalog = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const { user, canPlaceOrder } = useAuth();

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [engines, setEngines] = useState<string[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [categories, setCategories] = useState<CatalogCategoryNode[]>([]);
  const [categoryPath, setCategoryPath] = useState<string[]>([]);
  const [category, setCategory] = useState<CatalogCategoryNode | null>(null);
  const [categoryQuery, setCategoryQuery] = useState("");

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [items, setItems] = useState<CatalogPart[]>([]);
  const [jmWarning, setJmWarning] = useState<string | null>(null);

  useEffect(() => {
    fetchBrands().then(setBrands);
  }, []);

  useEffect(() => {
    if (brand) fetchModelsForBrand(brand).then(setModels);
  }, [brand]);

  useEffect(() => {
    if (brand && model) fetchEnginesForModel(brand, model).then(setEngines);
  }, [brand, model]);

  useEffect(() => {
    if (brand && model && engine) {
      setLoading(true);
      fetchNextisVehicles(brand, model).then(async (rows) => {
        const vehicle = rows.find(v => v.engine === engine) || rows[0];
        if (vehicle) {
          setSelectedVehicleId(vehicle.id);
          const tree = await fetchJmCategoryTree({ nextisVehicleId: vehicle.id, brand, model, engine });
          setCategories(tree);
        }
        setLoading(false);
      });
    }
  }, [brand, model, engine]);

  useEffect(() => {
    if (!category) return;
    
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setItems([]);
      try {
        const [oemRes, jmRes] = await Promise.all([
          listPartsForVehicle({ brand, model, engine, categoryKeywords: category.keywords }),
          fetchJmForVehicle({ brand, model, engine, nextisVehicleId: selectedVehicleId, sectionId: category.sectionId, categoryKeywords: category.keywords })
        ]);

        if (cancelled) return;

        let jmByCodes: CatalogPart[] = [];
        if (oemRes.items.length > 0) {
          jmByCodes = await fetchJmByCodes(oemRes.items.map(p => p.oem_number));
        }

        const combinedJm = [...jmByCodes, ...jmRes.items].filter(p => partMatchesKeywords(p, category.keywords));
        const final = mergeWithJm(oemRes.items, combinedJm);

        setItems(final);
        setJmWarning(final.length === 0 ? "V této kategorii nebyly nalezeny žádné díly." : null);
      } catch (e) {
        toast.error("Chyba při načítání dílů");
      } finally {
        setListLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [category]);

  const handleOrder = async (p: CatalogPart) => {
    if (!user) return navigate("/auth");
    if (!canPlaceOrder) return toast.error("Účet ještě nebyl schválen.");

    const unitPrice = p.price_without_vat ?? (p.price_with_vat ? Math.round(p.price_with_vat / 1.21 * 100) / 100 : null);
    const { error } = await supabase.from("orders").insert({
      user_id: user.id,
      part_id: p.id.startsWith("jm:") ? null : p.id,
      order_type: "new",
      quantity: 1,
      unit_price: unitPrice,
      part_name: p.name,
      oem_number: p.oem_number,
      catalog_source: p.catalog_source,
    });
    if (!error) toast.success("Objednáno");
  };

  const getVisibleCategories = () => {
    if (categoryQuery) {
      const flatten = (nodes: CatalogCategoryNode[]): CatalogCategoryNode[] => nodes.flatMap(n => [n, ...flatten(n.children)]);
      return flatten(categories).filter(c => c.label.toLowerCase().includes(categoryQuery.toLowerCase()));
    }
    let current = categories;
    for (const id of categoryPath) {
      current = current.find(c => c.id === id)?.children || [];
    }
    return current;
  };

  return (
    <div ref={ref} className="min-h-screen p-4 max-w-[1400px] mx-auto">
      <GlobalOEMSearch onOrder={handleOrder} />
      
      <div className="flex items-center gap-4 mb-6 mt-4">
        {brand && <Button variant="outline" size="sm" onClick={() => { 
          if (category) setCategory(null);
          else if (categoryPath.length > 0) setCategoryPath(p => p.slice(0, -1));
          else if (engine) setEngine("");
          else if (model) setModel("");
          else setBrand("");
        }}><ChevronLeft className="w-4 h-4 mr-1"/> Zpět</Button>}
        <h1 className="text-xl font-bold">Katalog dílů: {brand} {model} {engine}</h1>
      </div>

      {!brand && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {brands.map(b => <Button key={b} variant="secondary" className="h-24" onClick={() => setBrand(b)}>{b}</Button>)}
        </div>
      )}

      {brand && !model && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {models.map(m => <Button key={m} variant="ghost" className="justify-between" onClick={() => setModel(m)}>{m} <ChevronRight className="w-4 h-4"/></Button>)}
        </div>
      )}

      {model && !engine && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {engines.map(e => <Button key={e} variant="ghost" className="justify-between" onClick={() => setEngine(e)}>{e} <ChevronRight className="w-4 h-4"/></Button>)}
        </div>
      )}

      {engine && !category && (
        <div className="space-y-4">
          <Input placeholder="Hledat kategorii..." value={categoryQuery} onChange={e => setCategoryQuery(e.target.value)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {getVisibleCategories().map(c => (
              <Button key={c.id} variant="secondary" className="justify-between" onClick={() => c.children?.length ? setCategoryPath([...categoryPath, c.id]) : setCategory(c)}>
                {c.label} <Badge>{c.count}</Badge>
              </Button>
            ))}
          </div>
        </div>
      )}

      {category && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{category.label}</h2>
            {listLoading && <Loader2 className="w-4 h-4 animate-spin"/>}
          </div>
          {jmWarning && <div className="text-amber-500 text-sm">{jmWarning}</div>}
          <CatalogListing items={items} loading={listLoading} onOrder={handleOrder} />
        </div>
      )}
    </div>
  );
});

Catalog.displayName = "Catalog";
export default Catalog;
