import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className, disabled, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={clsx(
        "flex h-9 w-full items-center justify-center rounded-[8px] px-6 text-[14px] font-medium transition-colors",
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
