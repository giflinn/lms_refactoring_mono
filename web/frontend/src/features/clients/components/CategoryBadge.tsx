import clsx from "clsx";
import type { ClientCategory } from "../api";

const STYLES: Record<ClientCategory, { label: string; bg: string; fg: string }> = {
  new: { label: "Новый", bg: "#FFF3D6", fg: "#B47900" },
  regular: { label: "Постоянный", bg: "#EAECF0", fg: "#344054" },
  vip: { label: "VIP", bg: "#E5B8F4", fg: "#6D0094" },
};

export const CATEGORY_OPTIONS: { value: ClientCategory; label: string }[] = [
  { value: "new", label: STYLES.new.label },
  { value: "regular", label: STYLES.regular.label },
  { value: "vip", label: STYLES.vip.label },
];

export function CategoryBadge({
  category,
  className,
}: {
  category: ClientCategory;
  className?: string;
}) {
  const s = STYLES[category];
  return (
    <span
      className={clsx(
        "inline-flex h-7 min-w-[88px] items-center justify-center rounded-full px-3 text-[12px] font-medium",
        className,
      )}
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
