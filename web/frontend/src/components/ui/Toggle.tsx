import clsx from "clsx";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
};

export function Toggle({ checked, onChange, disabled, id }: Props) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative h-6 w-[43px] shrink-0 rounded-full p-0.5 transition-colors cursor-pointer",
        checked ? "bg-purple-primary" : "bg-[#EAECF0]",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={clsx(
          "block h-[19px] w-[19px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-transform",
          checked ? "translate-x-[19px]" : "translate-x-0",
        )}
      />
    </button>
  );
}
