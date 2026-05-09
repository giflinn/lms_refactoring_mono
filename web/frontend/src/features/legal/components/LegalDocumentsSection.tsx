import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { LEGAL_LABELS, LEGAL_SLUGS, type LegalSlug } from "../api";
import { useLegalList } from "../queries";
import { LegalDocumentDrawer } from "./LegalDocumentDrawer";

// Section embedded into /settings as the "Документы" tab. Lists the four
// fixed legal docs with their last-updated date; clicking a row opens the
// edit drawer.
export function LegalDocumentsSection() {
  const list = useLegalList();
  const [editing, setEditing] = useState<LegalSlug | null>(null);
  const [open, setOpen] = useState(false);

  const updatedBySlug: Record<string, string> = {};
  for (const doc of list.data ?? []) {
    updatedBySlug[doc.slug] = doc.updatedAt;
  }

  function openSlug(slug: LegalSlug) {
    setEditing(slug);
    setOpen(true);
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-[#0E131F]">Документы</h2>
      </header>
      <p className="max-w-[640px] text-[13px] leading-[1.5] text-grey-medium">
        Тексты появляются в мобильном приложении: «О нас» и «Политика
        конфиденциальности» — в Настройках, «Условия использования» и
        «Публичная оферта» — в корзине и при покупке товара. Сохранение
        вступает в силу мгновенно.
      </p>
      <div className="flex flex-col overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white">
        {LEGAL_SLUGS.map((slug, i) => (
          <button
            key={slug}
            type="button"
            onClick={() => openSlug(slug)}
            className={
              "flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-grey-lighter cursor-pointer" +
              (i > 0 ? " border-t border-[#EAECF0]" : "")
            }
          >
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[14px] font-medium text-[#0E131F]">
                {LEGAL_LABELS[slug]}
              </span>
              <span className="text-[12px] text-grey-medium">
                {updatedBySlug[slug]
                  ? `Обновлено ${formatDate(updatedBySlug[slug])}`
                  : "—"}
              </span>
            </div>
            <ChevronRight
              size={18}
              strokeWidth={1.5}
              className="text-grey-medium"
            />
          </button>
        ))}
      </div>
      <LegalDocumentDrawer
        slug={editing}
        open={open}
        onClose={() => setOpen(false)}
      />
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
