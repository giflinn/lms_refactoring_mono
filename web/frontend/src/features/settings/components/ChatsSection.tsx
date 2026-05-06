import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { useSaveSettings, useSettings } from "../queries";

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

export function ChatsSection() {
  const settingsQuery = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsQuery.data) setForm({ ...settingsQuery.data });
  }, [settingsQuery.data]);

  const dirty =
    settingsQuery.data &&
    FIELDS.some(
      (f) => (form[f.key] ?? "") !== (settingsQuery.data?.[f.key] ?? ""),
    );

  async function handleSave() {
    const updates: Record<string, string> = {};
    for (const f of FIELDS) updates[f.key] = form[f.key] ?? "";
    await save.mutateAsync(updates);
    toast.success("Настройки чатов сохранены");
  }

  return (
    <section className="rounded-[12px] border border-[rgba(102,112,133,0.2)] bg-white p-6">
      <h2 className="mb-1 text-[16px] font-semibold text-[#0E131F]">
        Настройки чатов
      </h2>
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
              onChange={(e) =>
                setForm({ ...form, [f.key]: e.target.value })
              }
            />
            <span className="text-[11px] text-grey-medium">{f.hint}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end">
        <Button
          disabled={!dirty || save.isPending}
          onClick={handleSave}
          className="!w-auto"
        >
          {save.isPending ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>
    </section>
  );
}
