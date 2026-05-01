import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { Drawer } from "../../../components/ui/Drawer";
import { Modal } from "../../../components/ui/Modal";
import {
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
} from "../queries";
import {
  ApiError,
  type ProductCategory,
} from "../api";
import { mapError } from "../errors";

type Props = {
  open: boolean;
  categories: ProductCategory[];
  onClose: () => void;
};

export function CategoriesDrawer({ open, categories, onClose }: Props) {
  const create = useCreateCategory();
  const rename = useRenameCategory();
  const remove = useDeleteCategory();

  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | undefined>();
  const [editing, setEditing] = useState<{
    id: string;
    value: string;
    error?: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) {
      setNewName("");
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
      await create.mutateAsync(name);
      setNewName("");
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(mapError(err.code).general);
      } else {
        setCreateError("Нет соединения с сервером.");
      }
    }
  }

  async function handleRename() {
    if (!editing) return;
    const name = editing.value.trim();
    if (!name) {
      setEditing({ ...editing, error: "Введите название." });
      return;
    }
    try {
      await rename.mutateAsync({ id: editing.id, name });
      setEditing(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setEditing({ ...editing, error: mapError(err.code).general });
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
    <Drawer open={open} title="Категории" onClose={onClose}>
      <form onSubmit={handleCreate} className="flex flex-col gap-2 pb-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            placeholder="Новая категория"
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError(undefined);
            }}
            className="h-11 flex-1 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] text-grey-dark outline-none focus:border-purple-primary"
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-[8px] bg-purple-primary px-4 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={18} strokeWidth={2} />
            {create.isPending ? "Добавление…" : "Добавить"}
          </button>
        </div>
        {createError && (
          <p className="text-[12px] text-red-error">{createError}</p>
        )}
      </form>

      <div className="flex flex-col">
        {categories.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-grey-medium">
            Пока нет категорий.
          </p>
        ) : (
          categories.map((c) => {
            const isEditing = editing?.id === c.id;
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 border-b border-[#EAECF0] py-3"
              >
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={editing!.value}
                      onChange={(e) =>
                        setEditing({
                          id: editing!.id,
                          value: e.target.value,
                          error: undefined,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleRename();
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="h-9 flex-1 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[14px] outline-none focus:border-purple-primary"
                    />
                    <button
                      type="button"
                      onClick={handleRename}
                      disabled={rename.isPending}
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
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-[14px] text-grey-dark">
                      {c.name}
                    </span>
                    <span className="text-[12px] text-grey-medium">
                      {c.productCount === 0
                        ? "нет товаров"
                        : `${c.productCount} ${pluralProducts(c.productCount)}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({ id: c.id, value: c.name })
                      }
                      className="cursor-pointer rounded-md p-1.5 text-grey-medium hover:bg-grey-lighter"
                      aria-label="Переименовать"
                    >
                      <Pencil size={16} strokeWidth={1.7} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(undefined);
                        setDeleteTarget(c);
                      }}
                      className="cursor-pointer rounded-md p-1.5 text-grey-medium hover:bg-grey-lighter"
                      aria-label="Удалить"
                    >
                      <Trash2 size={16} strokeWidth={1.7} />
                    </button>
                  </>
                )}
                {isEditing && editing?.error && (
                  <p className="basis-full pl-1 text-[12px] text-red-error">
                    {editing.error}
                  </p>
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
            Удалить категорию
          </h3>
          <p className="text-[14px] leading-relaxed text-grey-medium">
            Вы уверены, что хотите удалить категорию{" "}
            <span className="text-grey-dark">{deleteTarget?.name}</span>?
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

function pluralProducts(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "товаров";
  if (last === 1) return "товар";
  if (last >= 2 && last <= 4) return "товара";
  return "товаров";
}
