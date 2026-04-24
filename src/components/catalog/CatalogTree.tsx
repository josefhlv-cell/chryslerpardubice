/**
 * CatalogTree — Nextis-style drill-down sidebar.
 * Renders brand → model → engine → category, plus global sections (Náplně, Pneu...).
 */
import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, Car, Cog, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryNode } from "@/api/catalogV2API";

type Selection = { brand?: string; model?: string; engine?: string; category?: string; categoryId?: string };

interface Props {
  brands: CategoryNode[];
  globals: CategoryNode[];
  selection: Selection;
  onSelect: (s: Selection) => void;
}

const iconFor = (type: string) => {
  if (type === "brand") return Car;
  if (type === "model") return Folder;
  if (type === "engine") return Cog;
  if (type === "global") return Globe;
  return Folder;
};

const TreeRow = ({
  node,
  depth,
  selection,
  onSelect,
  pathBrand,
  pathModel,
  pathEngine,
}: {
  node: CategoryNode;
  depth: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  pathBrand?: string;
  pathModel?: string;
  pathEngine?: string;
}) => {
  const [open, setOpen] = useState(depth === 0);
  const Icon = iconFor(node.node_type);
  const hasChildren = (node.children?.length ?? 0) > 0;

  const isSelected =
    (node.node_type === "brand" && selection.brand === node.vehicle_brand && !selection.model) ||
    (node.node_type === "model" && selection.model === node.vehicle_model && !selection.engine) ||
    (node.node_type === "engine" && selection.engine === node.vehicle_engine && !selection.category) ||
    (node.node_type === "category" && selection.categoryId === node.id);

  const handleClick = () => {
    if (hasChildren) setOpen(!open);
    if (node.node_type === "brand") {
      onSelect({ brand: node.vehicle_brand || node.name_cs });
    } else if (node.node_type === "model") {
      onSelect({ brand: pathBrand, model: node.vehicle_model || node.name_cs });
    } else if (node.node_type === "engine") {
      onSelect({ brand: pathBrand, model: pathModel, engine: node.vehicle_engine || node.name_cs });
    } else if (node.node_type === "category" || node.node_type === "global") {
      onSelect({
        brand: pathBrand,
        model: pathModel,
        engine: pathEngine,
        category: node.name_cs,
        categoryId: node.id,
      });
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-1.5 py-1.5 pr-2 rounded-md text-left text-sm transition-colors",
          "hover:bg-secondary/60",
          isSelected && "bg-primary/15 text-primary font-medium"
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {hasChildren ? (
          open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
        ) : (
          <span className="w-3.5" />
        )}
        <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span className="truncate">{node.name_cs}</span>
      </button>

      {open && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selection={selection}
              onSelect={onSelect}
              pathBrand={node.node_type === "brand" ? node.vehicle_brand || node.name_cs : pathBrand}
              pathModel={node.node_type === "model" ? node.vehicle_model || node.name_cs : pathModel}
              pathEngine={node.node_type === "engine" ? node.vehicle_engine || node.name_cs : pathEngine}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CatalogTree = ({ brands, globals, selection, onSelect }: Props) => {
  return (
    <div className="space-y-4">
      {brands.length > 0 && (
        <div>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Vozidla
          </div>
          {brands.map((b) => (
            <TreeRow key={b.id} node={b} depth={0} selection={selection} onSelect={onSelect} />
          ))}
        </div>
      )}

      {globals.length > 0 && (
        <div>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Univerzální
          </div>
          {globals.map((g) => (
            <TreeRow key={g.id} node={g} depth={0} selection={selection} onSelect={onSelect} />
          ))}
        </div>
      )}

      {brands.length === 0 && globals.length === 0 && (
        <div className="px-3 py-6 text-xs text-muted-foreground text-center">
          Strom katalogu zatím není naplněn.
          <br />
          Spusťte synchronizaci v admin panelu.
        </div>
      )}
    </div>
  );
};

export default CatalogTree;
