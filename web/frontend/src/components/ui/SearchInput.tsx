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
    <div className={clsx("relative", className)}>
      <Search
        size={18}
        strokeWidth={1.5}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-medium"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white pl-9 pr-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary placeholder:text-grey-medium/60"
      />
    </div>
  );
}
