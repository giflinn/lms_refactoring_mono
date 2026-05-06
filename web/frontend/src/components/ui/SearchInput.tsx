import { Search } from "lucide-react";
import clsx from "clsx";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "Поиск",
  className,
}: Props) {
  return (
    <div
      className={clsx(
        "flex h-9 items-center gap-2 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 transition-colors focus-within:border-purple-dark hover:border-grey-medium",
        className,
      )}
    >
      <Search size={16} strokeWidth={1.75} className="text-grey-medium" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-grey-medium/60"
      />
    </div>
  );
}
