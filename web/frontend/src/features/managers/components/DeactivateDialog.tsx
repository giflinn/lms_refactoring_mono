import { Modal } from "../../../components/ui/Modal";
import type { Manager } from "../api";

type Props = {
  manager: Manager | null;
  pending: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function DeactivateDialog({
  manager,
  pending,
  error,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal open={manager !== null} onClose={pending ? () => {} : onClose}>
      <div className="flex w-[420px] flex-col gap-4 p-6">
        <h3 className="text-[18px] font-semibold text-[#0E131F]">
          Удалить менеджера?
        </h3>
        <p className="text-[14px] leading-relaxed text-grey-medium">
          Менеджер потеряет доступ в систему. Его клиенты будут равномерно
          распределены между другими активными менеджерами.
        </p>
        {error && (
          <p className="text-[13px] text-red-error">{error}</p>
        )}
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-6 py-3 text-[14px] font-medium text-[#0E131F] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-grey-lighter transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="cursor-pointer rounded-[8px] bg-purple-primary px-6 py-3 text-[14px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {pending ? "Удаление…" : "Удалить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
