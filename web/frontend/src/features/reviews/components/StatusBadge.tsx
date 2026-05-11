import clsx from "clsx";
import type { ReviewStatus } from "../api";

const LABELS: Record<ReviewStatus, string> = {
  pending: "На рассмотрении",
  published: "Опубликован",
  deleted: "Удалён",
};

const STYLES: Record<ReviewStatus, string> = {
  pending: "border-[#FA8905] bg-[rgba(255,149,0,0.1)] text-[#FA8905]",
  published: "border-[#34C759] bg-[rgba(52,199,89,0.1)] text-[#34C759]",
  deleted: "border-[#FF3B30] bg-[rgba(255,59,48,0.1)] text-[#FF3B30]",
};

const BASE =
  "inline-flex h-[28px] items-center rounded-[8px] border px-2.5 text-[13px] font-medium leading-none whitespace-nowrap";

export function ReviewStatusBadge({
  status,
  className,
}: {
  status: ReviewStatus;
  className?: string;
}) {
  return (
    <span className={clsx(BASE, STYLES[status], className)}>
      {LABELS[status]}
    </span>
  );
}

export function reviewStatusLabel(status: ReviewStatus): string {
  return LABELS[status];
}
