import { Modal } from "../../../components/ui/Modal";

type Props = {
  open: boolean;
  pending: boolean;
  onCancelOrder: () => void;
  onKeep: () => void;
};

// Shown right after a successful refund of an ACTIVE order. Refund and
// cancellation are decoupled (refund returns the money; cancellation revokes
// the order / client access) — so we ask the manager whether to also cancel the
// order or leave it active. Only surfaced when the order was still active, since
// a not-yet-active order is auto-cancelled by the refund itself.
export function RefundCancelDialog({
  open,
  pending,
  onCancelOrder,
  onKeep,
}: Props) {
  return (
    <Modal open={open} onClose={pending ? () => {} : onKeep}>
      <div className="w-[440px] p-6">
        <h3 className="text-[18px] font-semibold text-[#0E131F]">
          Возврат проведён
        </h3>
        <p className="mt-2 text-[14px] leading-snug text-grey-dark">
          Деньги возвращены. Отменить заказ (снять доступ клиента) или оставить
          его активным?
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onKeep}
            disabled={pending}
            className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[14px] font-medium text-[#0E131F] hover:bg-grey-lighter transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            Оставить активным
          </button>
          <button
            type="button"
            onClick={onCancelOrder}
            disabled={pending}
            className="cursor-pointer rounded-[8px] bg-[#FF3B30] px-4 py-2 text-[14px] font-medium text-white hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Отмена…" : "Отменить заказ"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
