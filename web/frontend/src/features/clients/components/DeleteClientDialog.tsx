import { Modal } from "../../../components/ui/Modal";
import type { Client } from "../api";

type Props = {
  client: Client | null;
  pending: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function DeleteClientDialog({
  client,
  pending,
  error,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal open={client !== null} onClose={pending ? () => {} : onClose}>
      <div className="flex w-[420px] flex-col gap-4 p-6">
        <h3 className="text-[16px] font-semibold text-[#0E131F]">
          Удалить клиента
        </h3>
        <p className="text-[14px] leading-relaxed text-grey-medium">
          Вы уверены, что хотите удалить клиента{" "}
          <span className="text-grey-dark">
            {client ? `${client.firstName} ${client.lastName}` : ""}
          </span>
          ? Доступ в мобильное приложение будет заблокирован.
        </p>
        {error && <p className="text-[13px] text-red-error">{error}</p>}
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[14px] font-medium text-[#0E131F] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-grey-lighter transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="cursor-pointer rounded-[8px] bg-purple-primary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {pending ? "Удаление…" : "Удалить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
