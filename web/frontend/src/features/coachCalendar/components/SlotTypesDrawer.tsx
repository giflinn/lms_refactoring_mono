import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import clsx from "clsx";
import { Drawer } from "../../../components/ui/Drawer";
import { Modal } from "../../../components/ui/Modal";
import {
  useCreateSlotType,
  useDeleteSlotType,
  useUpdateSlotType,
} from "../queries";
import { ApiError, type SlotType } from "../api";
import { mapError } from "../errors";

// Curated palette so types stay visually distinct on the calendar grid. Coach
// picks from this; the backend accepts any 6-digit hex.
const PALETTE = [
  "#810CA8",
  "#C147E9",
  "#3B82F6",
  "#06B6D4",
  "#22C55E",
  "#FFBD24",
  "#FA8905",
  "#EC4899",
];

type Props = {
  open: boolean;
  slotTypes: SlotType[];
  onClose: () => void;
};

export function SlotTypesDrawer({ open, slotTypes, onClose }: Props) {
  const create = useCreateSlotType();
  const update = useUpdateSlotType();
  const remove = useDeleteSlotType();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [createError, setCreateError] = useState<string | undefined>();

  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    color: string;
    error?: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SlotType | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) {
      setNewName("");
      setNewColor(PALETTE[0]);
      setCreateError(undefined);
      setEditing(null);
      setDeleteTarget(null);
      setDeleteError(undefined);
    }
  }, [open]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(undefined);
    const name = newName.trim();
    if (!name) {
      setCreateError("Введите название.");
      return;
    }
    try {
      await create.mutateAsync({ name, color: newColor });
      setNewName("");
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped = mapError(err.code);
        setCreateError(
          mapped.fields.name ?? mapped.fields.color ?? mapped.general,
        );
      } else {
        setCreateError("Нет соединения с сервером.");
      }
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      setEditing({ ...editing, error: "Введите название." });
      return;
    }
    try {
      await update.mutateAsync({
        id: editing.id,
        input: { name, color: editing.color },
      });
      setEditing(null);
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped = mapError(err.code);
        setEditing({
          ...editing,
          error:
            mapped.fields.name ?? mapped.fields.color ?? mapped.general,
        });
      } else {
        setEditing({ ...editing, error: "Нет соединения с сервером." });
      }
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(undefined);
    try {
      await remove.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(mapError(err.code).general);
      } else {
        setDeleteError("Нет соединения с сервером.");
      }
    }
  }

  return (
    <Drawer open={open} title="Типы слотов" onClose={onClose}>
      <form onSubmit={handleCreate} className="flex flex-col gap-3 pb-5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            placeholder="Например: Денежная прокачка"
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError(undefined);
            }}
            className="h-10 flex-1 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-[8px] bg-purple-primary px-4 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={18} strokeWidth={2} />
            {create.isPending ? "Добавление…" : "Добавить"}
          </button>
        </div>
        <ColorPalette value={newColor} onChange={setNewColor} />
        {createError && (
          <p className="text-[12px] text-red-error">{createError}</p>
        )}
      </form>

      <div className="flex flex-col">
        {slotTypes.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-grey-medium">
            Пока нет типов слотов.
          </p>
        ) : (
          slotTypes.map((t) => {
            const isEditing = editing?.id === t.id;
            return (
              <div
                key={t.id}
                className="flex flex-col gap-2 border-b border-[#EAECF0] py-3"
              >
                {isEditing ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={editing!.name}
                        onChange={(e) =>
                          setEditing({
                            ...editing!,
                            name: e.target.value,
                            error: undefined,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveEdit();
                          }
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="h-9 flex-1 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] outline-none focus:border-purple-primary"
                      />
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={update.isPending}
                        className="cursor-pointer rounded-md p-1.5 text-purple-primary hover:bg-grey-lighter disabled:opacity-50"
                        aria-label="Сохранить"
                      >
                        <Check size={18} strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="cursor-pointer rounded-md p-1.5 text-grey-medium hover:bg-grey-lighter"
                        aria-label="Отмена"
                      >
                        <X size={18} strokeWidth={2} />
                      </button>
                    </div>
                    <ColorPalette
                      value={editing!.color}
                      onChange={(color) =>
                        setEditing({ ...editing!, color, error: undefined })
                      }
                    />
                    {editing!.error && (
                      <p className="text-[12px] text-red-error">
                        {editing!.error}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="flex-1 truncate text-[14px] text-grey-dark">
                      {t.name}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          id: t.id,
                          name: t.name,
                          color: t.color,
                        })
                      }
                      className="cursor-pointer rounded-md p-1.5 text-grey-medium hover:bg-grey-lighter"
                      aria-label="Изменить"
                    >
                      <Pencil size={16} strokeWidth={1.7} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(undefined);
                        setDeleteTarget(t);
                      }}
                      className="cursor-pointer rounded-md p-1.5 text-grey-medium hover:bg-grey-lighter"
                      aria-label="Удалить"
                    >
                      <Trash2 size={16} strokeWidth={1.7} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Modal
        open={deleteTarget !== null}
        onClose={remove.isPending ? () => {} : () => setDeleteTarget(null)}
      >
        <div className="flex w-[420px] flex-col gap-4 p-6">
          <h3 className="text-[16px] font-semibold text-[#0E131F]">
            Удалить тип слота
          </h3>
          <p className="text-[14px] leading-relaxed text-grey-medium">
            Тип{" "}
            <span className="text-grey-dark">{deleteTarget?.name}</span>{" "}
            будет архивирован. Существующие слоты сохранят свой тип; новые слоты
            этого типа создавать будет нельзя.
          </p>
          {deleteError && (
            <p className="text-[13px] text-red-error">{deleteError}</p>
          )}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => setDeleteTarget(null)}
              className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[14px] font-medium text-[#0E131F] disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={confirmDelete}
              className="cursor-pointer rounded-[8px] bg-purple-primary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
            >
              {remove.isPending ? "Удаление…" : "Удалить"}
            </button>
          </div>
        </div>
      </Modal>
    </Drawer>
  );
}

function ColorPalette({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PALETTE.map((c) => {
        const active = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Выбрать цвет ${c}`}
            style={{ backgroundColor: c }}
            className={clsx(
              "h-7 w-7 cursor-pointer rounded-full transition",
              active
                ? "ring-2 ring-offset-2 ring-[#0E131F]"
                : "hover:scale-110",
            )}
          />
        );
      })}
    </div>
  );
}
