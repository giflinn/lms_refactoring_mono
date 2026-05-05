import clsx from "clsx";
import type { CancellationStatus } from "../api";

const LABELS: Record<CancellationStatus, string> = {
  requested: "Запрошено",
  approved: "Одобрено",
  rejected: "Отказано",
};

const STYLES: Record<CancellationStatus, string> = {
  requested: "border-[#FA8905] bg-[rgba(255,149,0,0.1)] text-[#FA8905]",
  approved: "border-[#34C759] bg-[rgba(52,199,89,0.1)] text-[#34C759]",
  rejected: "border-[#FF3B30] bg-[rgba(255,59,48,0.1)] text-[#FF3B30]",
};

const BASE =
  "inline-flex h-[28px] items-center rounded-[8px] border px-2.5 text-[13px] font-medium leading-none whitespace-nowrap";

export function CancellationStatusBadge({
  status,
  className,
}: {
  status: CancellationStatus;
  className?: string;
}) {
  return (
    <span className={clsx(BASE, STYLES[status], className)}>
      {LABELS[status]}
    </span>
  );
}

export function cancellationStatusLabel(status: CancellationStatus): string {
  return LABELS[status];
}

export const CANCELLATION_STATUS_OPTIONS: {
  value: CancellationStatus;
  label: string;
}[] = [
  { value: "requested", label: LABELS.requested },
  { value: "approved", label: LABELS.approved },
  { value: "rejected", label: LABELS.rejected },
];
