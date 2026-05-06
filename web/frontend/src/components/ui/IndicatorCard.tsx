import { type ReactNode } from "react";
import clsx from "clsx";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatGrowthPct } from "../../lib/format";

type Props = {
  label: string;
  value: ReactNode;
  // null = no growth row at all (cards that have no MoM context, e.g. "Всего").
  // number | null inside a non-null shape = render the row with "—" when null.
  growthPct?: number | null;
  // Alt copy for the trailing comparison line. Defaults to the dashboard's
  // "чем в прошлом месяце" but reports' new-clients tab uses "тенденция".
  growthTrailing?: string;
  iconUrl: string;
  // 10%-tinted brand color behind the icon plate. Inline rgba so each card
  // can dial its own hue without spawning a token per pair.
  iconBg: string;
};

export function IndicatorCard({
  label,
  value,
  growthPct,
  growthTrailing = "чем в прошлом месяце",
  iconUrl,
  iconBg,
}: Props) {
  const hasGrowth = growthPct !== undefined;
  const isUp = growthPct != null && growthPct >= 0;
  const isDown = growthPct != null && growthPct < 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <p className="text-[13px] font-medium text-grey-dark/70">{label}</p>
          <p className="truncate text-[24px] font-semibold leading-tight text-[#0E131F] tracking-tight">
            {value}
          </p>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]"
          style={{ backgroundColor: iconBg }}
        >
          <img src={iconUrl} alt="" className="h-5 w-5" />
        </div>
      </div>
      {hasGrowth && (
        <div className="flex items-center gap-1.5">
          {isUp && (
            <TrendingUp
              size={16}
              strokeWidth={2}
              className="text-[#34C759]"
              aria-hidden
            />
          )}
          {isDown && (
            <TrendingDown
              size={16}
              strokeWidth={2}
              className="text-red-error"
              aria-hidden
            />
          )}
          <span
            className={clsx(
              "text-[14px] font-semibold",
              isUp && "text-[#34C759]",
              isDown && "text-red-error",
              !isUp && !isDown && "text-grey-medium",
            )}
          >
            {formatGrowthPct(growthPct ?? null)}
          </span>
          <span className="text-[12px] text-grey-medium">{growthTrailing}</span>
        </div>
      )}
    </div>
  );
}
