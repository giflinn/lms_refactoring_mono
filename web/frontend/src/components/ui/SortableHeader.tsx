import clsx from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortDir = "asc" | "desc";

export type SortState<K extends string> = {
  by: K;
  dir: SortDir;
};

type Props<K extends string> = {
  // Stable key passed to onSort — keeps the callsite readable when the
  // visible label is verbose ("Сумма покупок").
  sortKey: K;
  label: string;
  state: SortState<K> | null;
  onSort: (next: SortState<K>) => void;
  align?: "left" | "right" | "center";
  className?: string;
};

export function SortableHeader<K extends string>({
  sortKey,
  label,
  state,
  onSort,
  align = "left",
  className,
}: Props<K>) {
  const isActive = state?.by === sortKey;
  const dir = isActive ? state.dir : null;
  function toggle() {
    if (!isActive) {
      onSort({ by: sortKey, dir: "desc" });
      return;
    }
    onSort({ by: sortKey, dir: dir === "desc" ? "asc" : "desc" });
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className={clsx(
        "inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-grey-dark transition-colors hover:text-[#0E131F]",
        align === "right" && "ml-auto flex-row-reverse",
        align === "center" && "mx-auto",
        isActive && "text-[#0E131F]",
        className,
      )}
    >
      <span>{label}</span>
      {dir === "asc" && (
        <ArrowUp size={14} strokeWidth={2} className="text-purple-primary" />
      )}
      {dir === "desc" && (
        <ArrowDown size={14} strokeWidth={2} className="text-purple-primary" />
      )}
      {dir === null && (
        <ArrowUpDown size={14} strokeWidth={1.5} className="text-grey-medium" />
      )}
    </button>
  );
}
