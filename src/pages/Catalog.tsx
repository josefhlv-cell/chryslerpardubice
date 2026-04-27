import { useEffect, useState } from "react";
import {
  fetchBrands,
  fetchModelsForBrand,
  fetchEnginesForModel,
  fetchJmCategoryTree,
  listPartsForVehicle,
  CatalogPart,
  CatalogCategoryNode
} from "@/lib/catalogV2API";

export default function Catalog() {
  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [engines, setEngines] = useState<string[]>([]);

  const [brand, setBrand] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [engine, setEngine] = useState<string>("");

  const [categories, setCategories] = useState<CatalogCategoryNode[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CatalogCategoryNode | null>(null);

  const [parts, setParts] = useState<CatalogPart[]>([]);
  const [loading, setLoading] = useState(false);

  // =========================================================
  // LOAD BRANDS
  // =========================================================
  useEffect(() => {
    fetchBrands().then(setBrands);
  }, []);

  // =========================================================
  // LOAD MODELS
  // =========================================================
  useEffect(() => {
    if (!brand) return;
    setModel("");
    setEngine("");
    fetchModelsForBrand(brand).then(setModels);
  }, [brand]);

  // =========================================================
  // LOAD ENGINES
  // =========================================================
  useEffect(() => {
    if (!brand || !model) return;
    setEngine("");
    fetchEnginesForModel(brand, model).then(setEngines);
  }, [model]);

  // =========================================================
  // LOAD CATEGORIES
  // =========================================================
  useEffect(() => {
    if (!brand || !model) return;

    fetchJmCategoryTree({
      brand,
      model,
      engine
    }).then(setCategories);
  }, [brand, model, engine]);

  // =========================================================
  // LOAD PARTS
  // =========================================================
  const loadParts = async (category?: CatalogCategoryNode) => {
    if (!brand || !model) return;

    setLoading(true);

    try {
      const res = await listPartsForVehicle({
        brand,
        model,
        engine,
        canonicalCategory: category?.label,
        categoryKeywords: category?.keywords
      });

      console.log("[UI] Loaded parts:", res);

      setParts(res.items);
    } catch (e) {
      console.error("[UI] Load parts error", e);
      setParts([]);
    }

    setLoading(false);
  };

  // =========================================================
  // RENDER
  // =========================================================
  return (
    <div style={{ padding: 20 }}>

      <h1>Katalog dílů</h1>

      {/* ========================= /}
      {/ SELECTORS /}
      {/ ========================= /}
      <div style={{ display: "flex", gap: 10 }}>

        <select value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">Značka</option>
          {brands.map(b => (
            <option key={b}>{b}</option>
          ))}
        </select>

        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">Model</option>
          {models.map(m => (
            <option key={m}>{m}</option>
          ))}
        </select>

        <select value={engine} onChange={(e) => setEngine(e.target.value)}>
          <option value="">Motor</option>
          {engines.map(e => (
            <option key={e}>{e}</option>
          ))}
        </select>

      </div>

      {/ ========================= /}
      {/ CATEGORIES /}
      {/ ========================= /}
      <div style={{ marginTop: 20 }}>
        <h3>Kategorie</h3>

        {categories.map(cat => (
          <div key={cat.id} style={{ marginBottom: 10 }}>
            <button
              onClick={() => {
                setSelectedCategory(cat);
                loadParts(cat);
              }}
            >
              {cat.label} ({cat.count})
            </button>
          </div>
        ))}
      </div>

      {/ ========================= /}
      {/ PARTS /}
      {/ ========================= */}
      <div style={{ marginTop: 30 }}>
        <h3>Díly</h3>

        {loading && <p>Načítání...</p>}

        {!loading && parts.length === 0 && (
          <p>Žádné výsledky</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {parts.map(p => (
            <div key={p.id} style={{ border: "1px solid #ccc", padding: 10 }}>

              <strong>{p.name}</strong>

              <p>{p.oem_number}</p>

              <p>{p.badge_label}</p>

              <p>
                {p.price_with_vat
                  ? ${p.price_with_vat} Kč
                  : "Cena není dostupná"}
              </p>

            </div>
          ))}
        </div>

      </div>

    </div>
  );
}