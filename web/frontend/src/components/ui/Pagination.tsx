import clsx from "clsx";

type Props = {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
};

// Build the visible page list with ellipses, e.g. for current=4 / total=10:
// [1, 2, 3, 4, 5, "…", 9, 10]. Always shows first 1-2 pages, last 2 pages,
// and a window around the current page.
function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [];
  const window = new Set([
    1,
    2,
    current - 1,
    current,
    current + 1,
    total - 1,
    total,
  ]);
  let prev = 0;
  for (let i = 1; i <= total; i++) {
    if (!window.has(i)) continue;
    if (i - prev > 1) pages.push("…");
    pages.push(i);
    prev = i;
  }
  return pages;
}

export function Pagination({ page, pageCount, onChange }: Props) {
  if (pageCount <= 1) return null;
  const pages = buildPages(page, pageCount);

  return (
    <div className="flex w-full items-center justify-between bg-white p-6">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="cursor-pointer rounded-[6px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-3 py-2.5 text-[14px] font-medium text-[#0E131F] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Назад
      </button>
      <div className="flex items-center">
        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              className="flex size-9 items-center justify-center text-[14px] text-[#96999D]"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={clsx(
                "flex size-9 cursor-pointer items-center justify-center rounded-[8px] text-[14px] font-medium transition-colors",
                p === page
                  ? "border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] text-[#0E131F]"
                  : "text-[#96999D] hover:bg-grey-lighter",
              )}
            >
              {p}
            </button>
          ),
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(pageCount, page + 1))}
        disabled={page === pageCount}
        className="cursor-pointer rounded-[6px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-3 py-2.5 text-[14px] font-medium text-[#0E131F] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Вперед
      </button>
    </div>
  );
}
