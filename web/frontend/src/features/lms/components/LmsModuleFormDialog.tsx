import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { LmsApiError, type LmsModule } from "../api";
import {
  useCreateLmsModule,
  useUpdateLmsModule,
} from "../queries";

type Props = {
  open: boolean;
  courseId: string;
  module: LmsModule | null;
  onClose: () => void;
};

// Lightweight modal — module is just a title. Used for both create and edit.
export function LmsModuleFormDialog({ open, courseId, module, onClose }: Props) {
  const isEdit = module !== null;
  const create = useCreateLmsModule(courseId);
  const update = useUpdateLmsModule(courseId);

  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setTitle(module?.title ?? "");
  }, [open, module]);

  const submitting = create.isPending || update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Введите название");
      return;
    }
    try {
      if (isEdit && module) {
        await update.mutateAsync({ id: module.id, title: trimmed });
      } else {
        await create.mutateAsync(trimmed);
      }
      onClose();
    } catch (err) {
      if (err instanceof LmsApiError && err.code === "title_too_long") {
        setError("Слишком длинное название");
      } else {
        setError("Не удалось сохранить.");
      }
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        onSubmit={onSubmit}
        className="flex w-[420px] flex-col gap-4 p-6"
      >
        <h2 className="text-[16px] font-semibold text-[#0E131F]">
          {isEdit ? "Редактировать модуль" : "Новый модуль"}
        </h2>
        <Input
          fullWidth
          label="Название модуля*"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={error}
          autoFocus
        />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] px-4 py-2 text-[13px] font-medium text-grey-medium hover:text-grey-dark cursor-pointer"
          >
            Отмена
          </button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Сохраняем…" : isEdit ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
