import { useMemo, useState } from "react";
import { ChevronRight, FileText, Image as ImageIcon, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isHtmlRecord, isImageRecord, type WowContentRecord } from "@/lib/delphi/wow/full-content";
import { buildTree, type WowTreeCategoryNode } from "@/lib/delphi/wow/tree-builder";

interface Props {
  compatible: WowContentRecord[];
  unverified: WowContentRecord[];
  selectedDocId: string | null;
  onOpen: (rec: WowContentRecord) => void;
}

/**
 * Lazy collapsible tree: children of a branch render only when it is expanded.
 * With 2 733 documents the full flat set is never materialised.
 */
export function WowDocumentTree({ compatible, unverified, selectedDocId, onOpen }: Props) {
  const compatTree = useMemo(() => buildTree(compatible), [compatible]);
  const unverTree = useMemo(() => buildTree(unverified), [unverified]);

  return (
    <div className="flex flex-col gap-3">
      <TreeSection
        title="Kompatibilní s vozidlem"
        icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
        count={compatible.length}
        tree={compatTree}
        emptyText="Pro vybrané vozidlo nebyla nalezena žádná ověřená dokumentace."
        defaultExpandFirst
        selectedDocId={selectedDocId}
        onOpen={onOpen}
        tone="ok"
      />
      <TreeSection
        title="Neověřená kompatibilita"
        icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
        count={unverified.length}
        tree={unverTree}
        emptyText="Žádné dokumenty bez ověřené kompatibility."
        defaultExpandFirst={false}
        selectedDocId={selectedDocId}
        onOpen={onOpen}
        tone="warn"
      />
    </div>
  );
}

function TreeSection({
  title, icon, count, tree, emptyText, defaultExpandFirst, selectedDocId, onOpen, tone,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  tree: WowTreeCategoryNode[];
  emptyText: string;
  defaultExpandFirst: boolean;
  selectedDocId: string | null;
  onOpen: (rec: WowContentRecord) => void;
  tone: "ok" | "warn";
}) {
  const [open, setOpen] = useState(defaultExpandFirst);
  const bg = tone === "ok" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200";
  return (
    <div className={`rounded-lg border ${bg}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-t-lg px-3 py-2 text-left text-sm font-medium hover:bg-black/5"
      >
        <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
        {icon}
        <span>{title}</span>
        <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{count}</Badge>
      </button>
      {open ? (
        <div className="border-t border-black/10 bg-white/60 p-2">
          {tree.length === 0 ? (
            <div className="p-3 text-xs text-slate-500">{emptyText}</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {tree.map((cat) => (
                <CategoryBranch key={cat.category} node={cat} onOpen={onOpen} selectedDocId={selectedDocId} defaultOpen={defaultExpandFirst && tree[0]?.category === cat.category} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CategoryBranch({
  node, onOpen, selectedDocId, defaultOpen,
}: {
  node: WowTreeCategoryNode;
  onOpen: (rec: WowContentRecord) => void;
  selectedDocId: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="rounded border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-medium hover:bg-slate-50"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        <span>{node.category}</span>
        <Badge variant="outline" className="ml-auto h-4 px-1 text-[10px]">{node.total}</Badge>
      </button>
      {open ? (
        <ul className="border-t border-slate-100">
          {node.systems.map((sys) => (
            <SystemBranch
              key={sys.system}
              category={node.category}
              system={sys.system}
              docs={sys.documents}
              onOpen={onOpen}
              selectedDocId={selectedDocId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SystemBranch({
  category, system, docs, onOpen, selectedDocId,
}: {
  category: string;
  system: string;
  docs: WowContentRecord[];
  onOpen: (rec: WowContentRecord) => void;
  selectedDocId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(50);
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-50"
        title={`${category} › ${system}`}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="truncate">{system}</span>
        <Badge variant="secondary" className="ml-auto h-4 px-1 text-[10px]">{docs.length}</Badge>
      </button>
      {open ? (
        <ul className="border-t border-slate-100 bg-slate-50/60">
          {docs.slice(0, limit).map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onOpen(d)}
                className={`flex w-full items-start gap-2 px-4 py-1 text-left text-[11px] hover:bg-slate-100 ${
                  selectedDocId === d.id ? "bg-sky-100" : ""
                }`}
              >
                {isImageRecord(d) && !isHtmlRecord(d) ? (
                  <ImageIcon className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                ) : (
                  <FileText className="mt-0.5 h-3 w-3 shrink-0 text-sky-600" />
                )}
                <span className="truncate">{d.title}</span>
              </button>
            </li>
          ))}
          {docs.length > limit ? (
            <li className="px-4 py-1">
              <button
                type="button"
                onClick={() => setLimit((n) => n + 100)}
                className="text-[11px] text-sky-700 hover:underline"
              >
                Zobrazit dalších {Math.min(100, docs.length - limit)} z {docs.length}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
