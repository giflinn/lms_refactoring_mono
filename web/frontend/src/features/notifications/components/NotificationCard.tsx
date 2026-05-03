import { Trash2 } from "lucide-react";
import type { Notification } from "../api";
import { notificationChips } from "../format";

type Props = {
  notification: Notification;
  onEdit: () => void;
  onDelete: () => void;
};

export function NotificationCard({ notification, onEdit, onDelete }: Props) {
  const chips = notificationChips(notification);
  return (
    <div className="flex items-center gap-6 rounded-[12px] bg-white p-4 shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]">
      <div className="flex flex-1 min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-[14px] font-semibold text-[#0E131F]">
            {notification.title}
          </p>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <span
                  key={c}
                  className="rounded-[6px] border border-[rgba(102,112,133,0.3)] bg-purple-lighter px-2 py-0.5 text-[12px] font-medium text-grey-medium"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="line-clamp-2 text-[13px] text-grey-medium">
          {notification.body}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-purple-lighter px-4 py-2 text-[14px] font-medium text-[#0E131F] transition-colors hover:bg-grey-lighter"
        >
          Редактировать
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Удалить"
          className="cursor-pointer rounded-[8px] p-2 text-grey-dark transition-colors hover:bg-grey-lighter"
        >
          <Trash2 size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
