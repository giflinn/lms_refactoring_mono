import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type Variant = "primary" | "outline";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  // Optional leading icon (typically a 20px lucide icon).
  icon?: ReactNode;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-purple-primary text-white hover:opacity-90 disabled:opacity-60",
  outline:
    "border border-[rgba(102,112,133,0.3)] bg-white text-[#0E131F] hover:bg-grey-lighter disabled:opacity-60",
};

/**
 * Standard "page header action" button — used in the top-right corner of
 * list/table pages (Товары, Менеджеры, Чаты, …) so they share one visual
 * language. Two variants: filled `primary` for CTAs ("Добавить товар"),
 * `outline` for secondary actions ("Настройки", "Редактировать категории").
 *
 * Height, radius, padding and font are fixed — that's the point. Don't
 * override these via `className`; reach for a different component if a
 * different shape is needed.
 */
export function PageActionButton({
  variant = "primary",
  icon,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        "flex h-9 cursor-pointer items-center gap-2 rounded-[8px] px-4 text-[14px] font-medium transition-opacity disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
