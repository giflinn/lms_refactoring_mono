import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className, disabled, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={clsx(
        "w-full rounded-[8px] px-6 py-[10px] text-[14px] font-medium leading-tight transition-colors",
        disabled
          ? "bg-purple-tertiary text-white/60 cursor-not-allowed"
          : "bg-purple-dark text-white hover:opacity-90 active:opacity-80",
        className,
      )}
    >
      {children}
    </button>
  );
}
