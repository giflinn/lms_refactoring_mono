import clsx from "clsx";

type Tab<T extends string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
};

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: Props<T>) {
  return (
    <div
      className={clsx(
        "flex items-center gap-0.5 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white p-0.5",
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={clsx(
              "h-10 cursor-pointer rounded-[6px] px-4 text-[14px] font-medium transition-colors",
              active
                ? "border border-[rgba(102,112,133,0.3)] bg-purple-lighter text-purple-primary"
                : "text-[#0E131F] hover:bg-grey-lighter",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
