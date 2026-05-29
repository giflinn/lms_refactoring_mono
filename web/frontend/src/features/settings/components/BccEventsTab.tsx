import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "../../../components/ui/Input";
import { SegmentedTabs } from "../../../components/ui/SegmentedTabs";
import { getBccEvents, type BccEvent } from "../api/bcc";
import {
  fmtDateTime,
  getIdToken,
  JsonBlock,
  kindLabel,
  OutcomeBadge,
  Pager,
} from "./bccShared";

type KindFilter = "all" | "purchase_form" | "callback" | "refund";
const KIND_TABS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "purchase_form", label: "Покупка" },
  { id: "callback", label: "Callback" },
  { id: "refund", label: "Возврат" },
];

type OutcomeFilter = "all" | "success" | "declined" | "error" | "unverified";
const OUTCOME_TABS: { id: OutcomeFilter; label: string }[] = [
  { id: "all", label: "Любой исход" },
  { id: "success", label: "Успех" },
  { id: "declined", label: "Отклонено" },
  { id: "error", label: "Ошибка" },
  { id: "unverified", label: "Не верифиц." },
];

export function BccEventsTab() {
  const [kind, setKind] = useState<KindFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [orderInput, setOrderInput] = useState("");
  const [page, setPage] = useState(1);

  const orderNumber = /^\d+$/.test(orderInput.trim())
    ? Number(orderInput.trim())
    : undefined;

  const q = useQuery({
    queryKey: ["bcc", "events", kind, outcome, orderNumber ?? null, page],
    queryFn: async () =>
      getBccEvents(await getIdToken(), {
        kind: kind === "all" ? undefined : kind,
        outcome: outcome === "all" ? undefined : outcome,
        orderNumber,
        page,
      }),
  });

  const reset = () => setPage(1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedTabs<KindFilter>
          tabs={KIND_TABS}
          value={kind}
          onChange={(k) => {
            setKind(k);
            reset();
          }}
        />
        <SegmentedTabs<OutcomeFilter>
          tabs={OUTCOME_TABS}
          value={outcome}
          onChange={(o) => {
            setOutcome(o);
            reset();
          }}
        />
        <div className="w-[200px]">
          <Input
            fullWidth
            label="№ заказа"
            value={orderInput}
            placeholder="например 1000022"
            onChange={(e) => {
              setOrderInput(e.target.value);
              reset();
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {q.isLoading && (
          <p className="px-1 py-4 text-[14px] text-grey-medium">Загрузка…</p>
        )}
        {q.isError && (
          <p className="px-1 py-4 text-[14px] text-red-error">
            Не удалось загрузить журнал.
          </p>
        )}
        {q.data?.items.length === 0 && (
          <p className="px-1 py-4 text-[14px] text-grey-medium">
            Событий не найдено.
          </p>
        )}
        {q.data?.items.map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </div>

      {q.data && (
        <Pager
          page={q.data.page}
          pageSize={q.data.pageSize}
          total={q.data.total}
          onPage={setPage}
        />
      )}
    </div>
  );
}

function EventRow({ e }: { e: BccEvent }) {
  const [open, setOpen] = useState(false);
  const hasPayload = !!e.payload && Object.keys(e.payload).length > 0;

  return (
    <div className="rounded-[10px] border border-[rgba(102,112,133,0.2)] bg-white">
      <button
        type="button"
        onClick={() => hasPayload && setOpen((v) => !v)}
        className={
          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px]" +
          (hasPayload ? " cursor-pointer hover:bg-grey-lighter" : " cursor-default")
        }
      >
        <span className="w-4 shrink-0 text-grey-medium">
          {hasPayload ? (
            open ? (
              <ChevronDown size={16} strokeWidth={1.5} />
            ) : (
              <ChevronRight size={16} strokeWidth={1.5} />
            )
          ) : null}
        </span>
        <span className="w-[130px] shrink-0 text-grey-medium">
          {fmtDateTime(e.createdAt)}
        </span>
        <span className="w-[120px] shrink-0 font-medium text-[#0E131F]">
          {kindLabel(e.kind)}
        </span>
        <span className="w-[110px] shrink-0">
          <OutcomeBadge outcome={e.outcome} />
        </span>
        <span className="w-[90px] shrink-0 text-grey-medium">
          {e.orderNumber != null ? `№${e.orderNumber}` : "—"}
        </span>
        <span className="min-w-0 flex-1 truncate text-grey-dark">
          {e.note ?? ""}
          {e.rc ? `  [RC ${e.rc}${e.rcText ? ` ${e.rcText}` : ""}]` : ""}
        </span>
      </button>
      {open && hasPayload && (
        <div className="border-t border-[rgba(102,112,133,0.15)] p-3">
          <JsonBlock data={e.payload} />
        </div>
      )}
    </div>
  );
}
