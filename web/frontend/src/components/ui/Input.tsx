import { useState, type InputHTMLAttributes } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import eyeOpen from "../../assets/eye_open.png";
import eyeClosed from "../../assets/eye_closed.png";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  error?: string;
  type?: "text" | "email" | "password";
  onClear?: () => void;
  fullWidth?: boolean;
};

export function Input({
  label,
  error,
  type = "text",
  onClear,
  value,
  className,
  fullWidth,
  ...rest
}: Props) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword && reveal ? "text" : type;
  const hasValue = typeof value === "string" && value.length > 0;

  return (
    <label className={clsx("flex flex-col gap-1", fullWidth ? "w-full" : "w-[300px]")}>
      <span className="py-1 text-[14px] font-medium text-grey-dark">
        {label}
      </span>
      <div
        className={clsx(
          "flex h-[44px] items-center gap-2 rounded-[8px] border bg-white px-3 py-[10px] transition-colors",
          error
            ? "border-red-500"
            : "border-[rgba(102,112,133,0.3)] focus-within:border-purple-dark",
          className,
        )}
      >
        <input
          {...rest}
          type={effectiveType}
          value={value}
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-grey-dark placeholder:text-grey-medium/60"
        />
        {hasValue && onClear && (
          <button
            type="button"
            onClick={onClear}
            className={clsx(
              "shrink-0",
              error ? "text-red-500" : "text-grey-medium/60 hover:text-grey-medium",
            )}
            aria-label="Очистить"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            aria-label={reveal ? "Скрыть пароль" : "Показать пароль"}
          >
            <img
              src={reveal ? eyeOpen : eyeClosed}
              alt=""
              width={20}
              height={20}
            />
          </button>
        )}
      </div>
      {error && (
        <span className="text-[12px] text-red-500 leading-tight">{error}</span>
      )}
    </label>
  );
}
