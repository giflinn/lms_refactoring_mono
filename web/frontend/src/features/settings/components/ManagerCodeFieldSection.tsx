import { toast } from "sonner";
import { Toggle } from "../../../components/ui/Toggle";
import { useSaveSettings, useSettings } from "../queries";

const KEY = "show_manager_code_on_register";

export function ManagerCodeFieldSection() {
  const settingsQuery = useSettings();
  const save = useSaveSettings();

  const enabled = settingsQuery.data?.[KEY] === "true";

  async function handleToggle(next: boolean) {
    try {
      await save.mutateAsync({ [KEY]: next ? "true" : "false" });
      toast.success(
        next
          ? "Поле «Код менеджера» включено в приложении"
          : "Поле «Код менеджера» скрыто в приложении",
      );
    } catch {
      toast.error("Не удалось сохранить настройку");
    }
  }

  return (
    <section className="rounded-[12px] border border-[rgba(102,112,133,0.2)] bg-white p-6">
      <h2 className="mb-1 text-[16px] font-semibold text-[#0E131F]">
        Код менеджера при регистрации
      </h2>
      {settingsQuery.isLoading ? (
        <p className="text-grey-medium text-[14px]">Загрузка…</p>
      ) : !settingsQuery.data ? (
        <p className="text-red-error text-[14px]">
          Не удалось загрузить настройки.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-6">
          <p className="max-w-[640px] text-[13px] leading-[1.5] text-grey-medium">
            Показывать необязательное поле «Код менеджера» на экранах
            регистрации в мобильном приложении. Когда поле скрыто, клиенты
            получают менеджера по стратегии ниже. Применяется сразу —
            обновлять сборку не нужно.
          </p>
          <Toggle
            checked={enabled}
            onChange={handleToggle}
            disabled={save.isPending}
          />
        </div>
      )}
    </section>
  );
}
