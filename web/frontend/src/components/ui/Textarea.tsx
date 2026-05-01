import { forwardRef, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(
  function Textarea({ label, error, className, id, ...rest }, ref) {
    return (
      <div className="flex w-full flex-col gap-1">
        {label && (
          <label
            htmlFor={id}
            className="py-1 text-[14px] font-medium text-grey-dark"
          >
            {label}
          </label>
        )}
        <textarea
          {...rest}
          id={id}
          ref={ref}
          className={clsx(
            "w-full resize-y rounded-[8px] border bg-white px-3 py-2.5 text-[14px] text-[#0E131F] focus:outline-none focus:border-purple-primary",
            error
              ? "border-red-error"
              : "border-[rgba(102,112,133,0.3)]",
            className,
          )}
        />
        {error && (
          <p className="text-[12px] text-red-error">{error}</p>
        )}
      </div>
    );
  },
);
