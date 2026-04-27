/**
 * Unified Catalog — FIXED VERSION
 * - OEM/Mopar vždy nahoře
 * - fallback description
 * - bezpečný filtr (nezmizí díly)
 * - stabilní total
 /

import { forwardRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  ChevronLeft,
  Loader2,
  Car,
  Wrench,
  Cog,
  Package,
  Snowflake,
  Zap,
  Filter as FilterIcon,
  Droplet,
  Disc,
  Gauge,
  Settings,
  Box,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import {
  fetchBrands,
  fetchModelsForBrand,
  fetchEnginesForModel,
  fetchNextisVehicles,
  fetchJmCategoryTree,
  listPartsForVehicle,
  fetchJmByCodes,
  fetchJmForVehicle,
  mergeWithJm,
  type CatalogPart,
  type CatalogCategoryNode,
  type NextisVehicle,
} from "@/api/catalogV2API";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import CatalogListing from "@/components/catalog/CatalogListing";
import GlobalOEMSearch from "@/components/catalog/GlobalOEMSearch";

const BRAND_ORDER = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"];

type Step = "brand" | "model" | "engine" | "category" | "parts";

const Catalog = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const { user, canPlaceOrder } = useAuth();

  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [engines, setEngines] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<NextisVehicle[]>([]);

  const [categories, setCategories] = useState<CatalogCategoryNode[]>([]);
  const [category, setCategory] = useState<CatalogCategoryNode | null>(null);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");

  const [items, setItems] = useState<CatalogPart[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  // ---------- LOAD BRANDS ----------
  useEffect(() => {
    fetchBrands().then((bs) => {
      const sorted = [...bs].sort((a, b) => {
        const ia = BRAND_ORDER.indexOf(a);
        const ib = BRAND_ORDER.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      });
      setBrands(sorted);
    });
  }, []);

  // ---------- LOAD MODELS ----------
  useEffect(() => {
    if (!brand) return setModels([]);
    fetchModelsForBrand(brand).then(setModels);
  }, [brand]);

  // ---------- LOAD ENGINES ----------
  useEffect(() => {
    if (!brand || !model) return setEngines([]);
    fetchEnginesForModel(brand, model).then(setEngines);
  }, [brand, model]);

  // ---------- LOAD VEHICLES + CATEGORIES ----------
  useEffect(() => {
    if (!brand || !model || !engine) return;

    (async () => {
      setLoading(true);

      const rows = await fetchNextisVehicles(brand, model);
      setVehicles(rows);

      const vehicle = rows.find((v) => v.engine === engine) || rows[0];
      const vehicleId = vehicle?.id || "";

      setSelectedVehicleId(vehicleId);

      if (!vehicleId) return;

      const tree = await fetchJmCategoryTree({
        nextisVehicleId: vehicleId,
        brand,
        model,
        engine,
      });

      setCategories(tree);
      setLoading(false);
    })();
  }, [brand, model, engine]);

  // ---------- LOAD PARTS ----------
  useEffect(() => {
    if (!brand || !model || !engine || !category) return;

    (async () => {
      setListLoading(true);

      try {
        const [oemRes, jmRes] = await Promise.allSettled([
          listPartsForVehicle({
            brand,
            model,
            engine,
            nextisVehicleId: selectedVehicleId,
            canonicalCategory: category.label,
          }),
          fetchJmForVehicle({
            brand,
            model,
            engine,
            nextisVehicleId: selectedVehicleId,
            category: category.label,
          }),
        ]);

        const oemItems =
          oemRes.status === "fulfilled" ? oemRes.value.items : [];

        const jmItems =
          jmRes.status === "fulfilled" ? jmRes.value.items : [];

        // ---------- MERGE ----------
        let merged = mergeWithJm(oemItems, jmItems);

        // ---------- SORT (OEM FIRST) ----------
        merged = merged.sort((a, b) => {
          const aOem =
            a.catalog_source === "oem" || a.catalog_source === "mopar";
          const bOem =
            b.catalog_source === "oem" || b.catalog_source === "mopar";

          if (aOem && !bOem) return -1;
          if (!aOem && bOem) return 1;

          return (a.price_with_vat || 0) - (b.price_with_vat || 0);
        });

        // ---------- DESCRIPTION FIX ----------
        const enriched = merged.map((p) => ({
          ...p,
          description:
            p.description ||
            p.category ||
            OEM ${p.oem_number || ""} ||
            "Bez popisu",
        }));

        setItems(enriched);
        setTotal(enriched.length);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setListLoading(false);
      }
    })();
  }, [brand, model, engine, category]);

  // ---------- ORDER ----------
  const handleOrder = async (p: CatalogPart) => {
    if (!user) {
      toast.error("Přihlaste se");
      return;
    }

    await supabase.from("orders").insert({
      user_id: user.id,
      part_name: p.name,
      oem_number: p.oem_number,
    });

    toast.success("Objednáno");
  };

  // ---------- UI ----------
  return (
    <div ref={ref} className="p-6">
      <GlobalOEMSearch onOrder={handleOrder} />

      {/ STEP */}
      {!brand && (
        <div className="grid grid-cols-3 gap-4">
          {brands.map((b) => (
            <button key={b} onClick={() => setBrand(b)}>
              {b}
            </button>
          ))}
        </div>
      )}

      {brand && !model && (
        <div>
          {models.map((m) => (
            <button key={m} onClick={() => setModel(m)}>
              {m}
            </button>
          ))}
        </div>
      )}

      {model && !engine && (
        <div>
          {engines.map((e) => (
            <button key={e} onClick={() => setEngine(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {engine && !category && (
        <div>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategory(c)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {category && (
        <CatalogListing
          items={items}
          loading={listLoading}
          onOrder={handleOrder}
        />
      )}
    </div>
  );
});

export default Catalog;