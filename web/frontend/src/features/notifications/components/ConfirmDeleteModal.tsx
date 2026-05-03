import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import type { Notification } from "../api";

type Props = {
  notification: Notification | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDeleteModal({
  notification,
  pending,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal open={notification !== null} onClose={onCancel}>
      <div className="flex w-[420px] flex-col gap-4 p-6">
        <h3 className="text-[18px] font-semibold text-[#0E131F]">
          Удалить нотификацию?
        </h3>
        <p className="text-[14px] text-grey-medium">
          «{notification?.title}» будет безвозвратно удалена. Запланированные
          отправки не выполнятся.
        </p>
        <div className="flex gap-2 pt-2">
          <Button
            onClick={onCancel}
            disabled={pending}
            className="bg-white border border-[rgba(102,112,133,0.3)] text-[#0E131F] hover:bg-grey-lighter"
          >
            Отмена
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Удаление…" : "Удалить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
