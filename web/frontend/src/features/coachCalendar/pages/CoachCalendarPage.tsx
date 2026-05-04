import { useMemo, useState } from "react";
import { CalendarHeader } from "../components/CalendarHeader";
import { SlotFormModal } from "../components/SlotFormModal";
import { SlotTypesDrawer } from "../components/SlotTypesDrawer";
import { WeekGrid } from "../components/WeekGrid";
import type { CoachSlot } from "../api";
import { useCoachSlots, useSlotTypes } from "../queries";
import { addDays, endOfWeek, startOfWeek } from "../lib/dates";
import { OrderDrawer } from "../../orders/components/OrderDrawer";

type SlotFormMode =
  | { kind: "create"; preset: { day: Date; hour: number } | null }
  | { kind: "edit"; slot: CoachSlot };

export function CoachCalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedSlotTypeId, setSelectedSlotTypeId] = useState<string | null>(
    null,
  );
  const [slotFormMode, setSlotFormMode] = useState<SlotFormMode | null>(null);
  const [typesDrawerOpen, setTypesDrawerOpen] = useState(false);
  const [orderDrawerId, setOrderDrawerId] = useState<string | null>(null);
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false);

  const slotTypesQ = useSlotTypes();
  const weekEnd = useMemo(() => endOfWeek(weekStart), [weekStart]);

  const slotsQ = useCoachSlots({
    from: weekStart.toISOString(),
    to: weekEnd.toISOString(),
    slotTypeId: selectedSlotTypeId,
  });

  const slotTypes = slotTypesQ.data ?? [];
  const slots = slotsQ.data ?? [];
  const noTypesYet = !slotTypesQ.isLoading && slotTypes.length === 0;

  function openCreate() {
    if (slotTypes.length === 0) {
      setTypesDrawerOpen(true);
      return;
    }
    setSlotFormMode({ kind: "create", preset: null });
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <CalendarHeader
        weekStart={weekStart}
        onPrev={() => setWeekStart((w) => addDays(w, -7))}
        onNext={() => setWeekStart((w) => addDays(w, 7))}
        onToday={() => setWeekStart(startOfWeek(new Date()))}
        selectedSlotTypeId={selectedSlotTypeId}
        onSelectSlotType={setSelectedSlotTypeId}
        slotTypes={slotTypes}
        onManageTypes={() => setTypesDrawerOpen(true)}
        onCreateSlot={openCreate}
      />

      {slotsQ.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-3 text-[13px] text-red-error">
          Не удалось загрузить слоты. Обновите страницу.
        </div>
      )}

      {noTypesYet ? (
        <div className="rounded-[10px] border border-dashed border-[#EAECF0] bg-white p-10 text-center">
          <p className="text-[14px] text-grey-dark">
            Сначала создайте хотя бы один тип слота — это группы, по которым
            коач будет распределять время (например «Денежная прокачка»).
          </p>
          <button
            type="button"
            onClick={() => setTypesDrawerOpen(true)}
            className="mt-3 cursor-pointer rounded-[8px] bg-purple-primary px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
          >
            Создать тип слота
          </button>
        </div>
      ) : (
        <WeekGrid
          weekStart={weekStart}
          slots={slots}
          onSlotClick={(slot) =>
            setSlotFormMode({ kind: "edit", slot })
          }
          onEmptyClick={(day, hour) =>
            setSlotFormMode({ kind: "create", preset: { day, hour } })
          }
          onBookingClick={(b) => {
            if (!b.orderId) return;
            setOrderDrawerId(b.orderId);
            setOrderDrawerOpen(true);
          }}
        />
      )}

      <SlotFormModal
        open={slotFormMode !== null}
        mode={slotFormMode}
        slotTypes={slotTypes}
        onClose={() => setSlotFormMode(null)}
      />

      <SlotTypesDrawer
        open={typesDrawerOpen}
        slotTypes={slotTypes}
        onClose={() => setTypesDrawerOpen(false)}
      />

      <OrderDrawer
        orderId={orderDrawerId}
        open={orderDrawerOpen}
        onClose={() => setOrderDrawerOpen(false)}
      />
    </div>
  );
}
