import { useEffect, useState } from "react";
import { Drawer } from "../../../components/ui/Drawer";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import {
  useSaveSettings,
  useSettings,
} from "../../settings/queries";

type Props = {
  open: boolean;
  onClose: () => void;
};

const FIELDS = [
  {
    key: "support_whatsapp",
    label: "WhatsApp поддержки",
    placeholder: "+7 700 000 0000",
    hint: "Показывается клиентам в окне «?» поверх чата с менеджером.",
  },
  {
    key: "support_hours",
    label: "Часы работы менеджеров",
    placeholder: "11:00 – 16:00",
    hint: "Подпись «Часы работы с …» в пустом состоянии чата.",
  },
] as const;

export function ChatSettingsDrawer({ open, onClose }: Props) {
  const settingsQuery = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsQuery.data) setForm({ ...settingsQuery.data });
  }, [settingsQuery.data]);

  // Reset local edits whenever the drawer is reopened so a stale form from a
  // previous cancellation doesn't show.
  useEffect(() => {
    if (open && settingsQuery.data) setForm({ ...settingsQuery.data });
  }, [open, settingsQuery.data]);

  const dirty =
    settingsQuery.data &&
    FIELDS.some(
      (f) => (form[f.key] ?? "") !== (settingsQuery.data?.[f.key] ?? ""),
    );

  async function handleSave() {
    const updates: Record<string, string> = {};
    for (const f of FIELDS) {
      updates[f.key] = form[f.key] ?? "";
    }
    await save.mutateAsync(updates);
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Настройки чатов"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] px-4 py-2 text-[13px] text-grey-dark hover:bg-grey-lighter"
          >
            Отмена
          </button>
          <Button
            disabled={!dirty || save.isPending}
            onClick={handleSave}
            className="!w-auto"
          >
            {save.isPending ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-[12px] text-grey-medium">
        Значения сразу применяются к мобильному приложению — обновлять сборку
        не нужно.
      </p>
      <div className="flex flex-col gap-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <Input
              label={f.label}
              value={form[f.key] ?? ""}
              placeholder={f.placeholder}
              fullWidth
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
            <span className="text-[11px] text-grey-medium">{f.hint}</span>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
