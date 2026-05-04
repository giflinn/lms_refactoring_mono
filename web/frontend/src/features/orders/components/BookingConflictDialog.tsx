import { Modal } from "../../../components/ui/Modal";

type Props = {
  open: boolean;
  pending: boolean;
  onForce: () => void;
  onCancel: () => void;
};

// Shown when reverting an order out of 'cancelled' fails because some of its
// coach_bookings overlap with bookings that were placed in the meantime.
// Two ways out: bail (status stays cancelled) or revive the order without
// the conflicting reservations.
export function BookingConflictDialog({
  open,
  pending,
  onForce,
  onCancel,
}: Props) {
  return (
    <Modal open={open} onClose={pending ? () => {} : onCancel}>
      <div className="w-[440px] p-6">
        <h3 className="text-[18px] font-semibold text-[#0E131F]">
          Конфликт бронирований
        </h3>
        <p className="mt-2 text-[14px] leading-snug text-grey-dark">
          Время одного или нескольких слотов уже занято другими заказами.
          Восстановить заказ без этих бронирований?
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[14px] font-medium text-[#0E131F] hover:bg-grey-lighter transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onForce}
            disabled={pending}
            className="cursor-pointer rounded-[8px] bg-purple-primary px-4 py-2 text-[14px] font-medium text-white hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Восстановление…" : "Восстановить без брони"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
