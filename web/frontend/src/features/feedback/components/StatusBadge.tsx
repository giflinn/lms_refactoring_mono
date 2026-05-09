import clsx from "clsx";
import type { FeedbackStatus } from "../api";

const LABELS: Record<FeedbackStatus, string> = {
  new: "Новое",
  in_progress: "В работе",
  resolved: "Решено",
};

const STYLES: Record<FeedbackStatus, string> = {
  new: "border-[#FA8905] bg-[rgba(255,149,0,0.1)] text-[#FA8905]",
  in_progress: "border-[#0A84FF] bg-[rgba(10,132,255,0.1)] text-[#0A84FF]",
  resolved: "border-[#34C759] bg-[rgba(52,199,89,0.1)] text-[#34C759]",
};

const BASE =
  "inline-flex h-[28px] items-center rounded-[8px] border px-2.5 text-[13px] font-medium leading-none whitespace-nowrap";

export function FeedbackStatusBadge({
  status,
  className,
}: {
  status: FeedbackStatus;
  className?: string;
}) {
  return (
    <span className={clsx(BASE, STYLES[status], className)}>
      {LABELS[status]}
    </span>
  );
}

export function feedbackStatusLabel(status: FeedbackStatus): string {
  return LABELS[status];
}

export const FEEDBACK_STATUS_OPTIONS: {
  value: FeedbackStatus;
  label: string;
}[] = [
  { value: "new", label: LABELS.new },
  { value: "in_progress", label: LABELS.in_progress },
  { value: "resolved", label: LABELS.resolved },
];

export const FEEDBACK_STATUS_BADGE_STYLES = STYLES;
export const FEEDBACK_STATUS_LABELS = LABELS;
