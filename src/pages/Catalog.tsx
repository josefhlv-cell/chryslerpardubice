/**
 * Catalog v2 — Nextis-style B2B catalog with OEM-first listing.
 * Routes: /catalog
 *
 * Layout: full-width with left tree sidebar (md+), top breadcrumb, listing grid.
 * Sources: Mopar (OEM, rank 1) + J+M (rank 5). SAG/AutoKelly excluded.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, Loader2, RefreshCw, Menu, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import {
  fetchCategoryTree,
  brandsOnly,
  globalsOnly,
  listParts,
  type CategoryNode,
  type CatalogPart,
} from "@/api/catalogV2API";
import CatalogTree from "@/components/catalog/CatalogTree";
import CatalogListing from "@/components/catalog/CatalogListing";
import { jmAdapter } from "@/lib/catalog/adapters/jm";

type Selection = { brand?: string; model?: string; engine?: string; category?: string; categoryId?: string };

const Catalog = () => {
  const navigate = useNavigate();
  const { user, canPlaceOrder } = useAuth();

  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [selection, setSelection] = useState<Selection>({});
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [items, setItems] = useState<CatalogPart[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [page, setPage] = useState(0);

  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);

  const brands = useMemo(() => brandsOnly(tree), [tree]);
  const globals = useMemo(() => globalsOnly(tree), [tree]);

  // Initial tree load
  useEffect(() => {
    (async () => {
      try {
        setTreeLoading(true);
        const roots = await fetchCategoryTree();
        setTree(roots);
      } catch (err: any) {
        toast.error("Nelze načíst strom katalogu: " + err.message);
      } finally {
        setTreeLoading(false);
      }
    })();
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Listing fetch
  useEffect(() => {
    if (!selection.brand && !selection.category && !debounced) {
      setItems([]);
      setTotal(0);
      return;
    }
    (async () => {
      try {
        setListLoading(true);
        const { items, total } = await listParts({
          brand: selection.brand,
          model: selection.model,
          engine: selection.engine,
          category: selection.category,
          search: debounced || undefined,
          page,
          pageSize: 30,
        });
        setItems(items);
        setTotal(total);
      } catch (err: any) {
        toast.error("Chyba načítání: " + err.message);
        setItems([]);
      } finally {
        setListLoading(false);
      }
    })();
  }, [selection, debounced, page]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [selection, debounced]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await jmAdapter.syncCategories();
      toast.success(`Synchronizováno ${res.synced} kategorií (${res.skipped} přeskočeno).`);
      // Reload tree
      const roots = await fetchCategoryTree();
      setTree(roots);
    } catch (err: any) {
      toast.error("Synchronizace selhala: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleOrder = async (p: CatalogPart) => {
    if (!user) {
      toast.error("Pro objednávku se musíte přihlásit");
      navigate("/auth");
      return;
    }
    if (!canPlaceOrder) {
      toast.error("Účet ještě nebyl schválen.");
      return;
    }
    try {
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        part_id: p.id,
        order_type: "new" as const,
        quantity: 1,
        unit_price: p.price_without_vat,
        part_name: p.name,
        oem_number: p.oem_number,
        catalog_source: p.catalog_source,
      });
      if (error) throw error;
      toast.success(`Objednávka "${p.name}" vytvořena`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const breadcrumb = [selection.brand, selection.model, selection.engine, selection.category]
    .filter(Boolean)
    .join(" › ");

  const treeContent = treeLoading ? (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
    </div>
  ) : (
    <CatalogTree
      brands={brands}
      globals={globals}
      selection={selection}
      onSelect={(s) => {
        setSelection(s);
        setMobileTreeOpen(false);
      }}
    />
  );

  return (
    <div className="min-h-screen pb-24 lg:pb-8">
      {/* Header */}
      <div className="border-b border-border/30 bg-background/90 backdrop-blur-2xl sticky top-14 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Mobile tree trigger */}
            <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden h-9 w-9 shrink-0">
                  <Menu className="w-4 h-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0 overflow-y-auto">
                <div className="p-3 border-b border-border/30">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Strom katalogu</h2>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMobileTreeOpen(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="p-2">{treeContent}</div>
              </SheetContent>
            </Sheet>

            <div className="flex-1 min-w-0">
              <h1 className="font-display text-lg md:text-xl font-bold tracking-tight truncate">
                Katalog dílů
              </h1>
              {breadcrumb && (
                <p className="text-[11px] text-muted-foreground truncate">{breadcrumb}</p>
              )}
            </div>

            <div className="relative w-full max-w-xs hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="OEM nebo název dílu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs hidden md:flex"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              Sync J+M
            </Button>
          </div>

          {/* Mobile search */}
          <div className="relative md:hidden mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="OEM nebo název dílu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-[1600px] mx-auto px-4 py-4 flex gap-4">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-72 shrink-0 sticky top-32 self-start max-h-[calc(100vh-9rem)] overflow-y-auto pr-2 border-r border-border/30">
          {treeContent}
        </aside>

        {/* Listing */}
        <main className="flex-1 min-w-0">
          {selection.brand || selection.category || debounced ? (
            <>
              <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
                <span>
                  {total > 0 ? `${total} dílů` : "—"}
                  {breadcrumb && <span className="hidden md:inline"> · {breadcrumb}</span>}
                </span>
                {(selection.brand || selection.category || debounced) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setSelection({});
                      setSearch("");
                    }}
                  >
                    Vymazat
                  </Button>
                )}
              </div>

              <CatalogListing
                items={items}
                loading={listLoading}
                onOrder={handleOrder}
                emptyHint={
                  debounced
                    ? `Pro "${debounced}" nebyly nalezeny žádné díly.`
                    : "V této kategorii zatím nejsou díly."
                }
              />

              {total > 30 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Předchozí
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Strana {page + 1} / {Math.ceil(total / 30)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(page + 1) * 30 >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Další
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <ChevronRight className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground max-w-md">
                Vyberte vlevo značku, model a kategorii. Originální Mopar díly se zobrazí nahoře,
                alternativy J+M pod nimi.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Catalog;
