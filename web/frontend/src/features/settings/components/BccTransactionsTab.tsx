import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Input } from "../../../components/ui/Input";
import { SegmentedTabs } from "../../../components/ui/SegmentedTabs";
import {
  getBccTransaction,
  getBccTransactions,
  type BccTxnListItem,
} from "../api/bcc";
import {
  fmtDateTime,
  fmtMoney,
  getIdToken,
  JsonBlock,
  kindLabel,
  OutcomeBadge,
  Pager,
  TxnStatusBadge,
} from "./bccShared";

type StatusFilter = "all" | "paid" | "pending" | "failed" | "refunded";
const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "paid", label: "Оплачено" },
  { id: "pending", label: "Ожидает" },
  { id: "failed", label: "Ошибка" },
  { id: "refunded", label: "Возврат" },
];

export function BccTransactionsTab() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [orderInput, setOrderInput] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const orderNumber = /^\d+$/.test(orderInput.trim())
    ? Number(orderInput.trim())
    : undefined;

  const q = useQuery({
    queryKey: ["bcc", "transactions", status, orderNumber ?? null, page],
    queryFn: async () =>
      getBccTransactions(await getIdToken(), {
        status: status === "all" ? undefined : status,
        orderNumber,
        page,
      }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedTabs<StatusFilter>
          tabs={STATUS_TABS}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setPage(1);
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
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.2)] bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[rgba(102,112,133,0.15)] text-left text-grey-medium">
              <Th>Дата</Th>
              <Th>№ заказа</Th>
              <Th>BCC ORDER</Th>
              <Th>Статус</Th>
              <Th>Сумма</Th>
              <Th>RC</Th>
              <Th>Карта</Th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-grey-medium">
                  Загрузка…
                </td>
              </tr>
            )}
            {q.isError && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-red-error">
                  Не удалось загрузить транзакции.
                </td>
              </tr>
            )}
            {q.data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-grey-medium">
                  Нет транзакций.
                </td>
              </tr>
            )}
            {q.data?.items.map((t) => (
              <Row key={t.id} t={t} onClick={() => setOpenId(t.id)} />
            ))}
          </tbody>
        </table>
      </div>

      {q.data && (
        <Pager
          page={q.data.page}
          pageSize={q.data.pageSize}
          total={q.data.total}
          onPage={setPage}
        />
      )}

      {openId && <TxnDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2.5 align-middle">{children}</td>;
}

function Row({ t, onClick }: { t: BccTxnListItem; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-[rgba(102,112,133,0.1)] last:border-0 hover:bg-grey-lighter"
    >
      <Td>{fmtDateTime(t.createdAt)}</Td>
      <Td>{t.orderNumber != null ? `№${t.orderNumber}` : "—"}</Td>
      <Td>{t.bccOrder}</Td>
      <Td>
        <TxnStatusBadge status={t.status} />
      </Td>
      <Td>{fmtMoney(t.amountTenge)}</Td>
      <Td>
        {t.rc ? (
          <span title={t.rcText ?? ""}>
            {t.rc}
            {t.rcText ? ` · ${t.rcText}` : ""}
          </span>
        ) : (
          "—"
        )}
      </Td>
      <Td>{t.cardMask ?? "—"}</Td>
    </tr>
  );
}

function TxnDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["bcc", "transaction", id],
    queryFn: async () => getBccTransaction(await getIdToken(), id),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[760px] rounded-[14px] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#0E131F]">
            Транзакция BCC
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[6px] text-grey-medium hover:bg-grey-lighter"
            aria-label="Закрыть"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {q.isLoading && <p className="text-[14px] text-grey-medium">Загрузка…</p>}
        {q.isError && (
          <p className="text-[14px] text-red-error">Не удалось загрузить.</p>
        )}
        {q.data && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <TxnStatusBadge status={q.data.transaction.status} />
              {q.data.transaction.orderNumber != null && (
                <span className="text-[14px] font-medium text-[#0E131F]">
                  Заказ №{q.data.transaction.orderNumber}
                </span>
              )}
              <span className="text-[13px] text-grey-medium">
                BCC ORDER {q.data.transaction.bccOrder}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <Field label="Сумма" value={fmtMoney(q.data.transaction.amountTenge)} />
              <Field
                label="Статус заказа"
                value={q.data.transaction.orderPaymentStatus ?? "—"}
              />
              <Field
                label="RC"
                value={
                  q.data.transaction.rc
                    ? `${q.data.transaction.rc}${q.data.transaction.rcText ? ` · ${q.data.transaction.rcText}` : ""}`
                    : "—"
                }
              />
              <Field label="Карта" value={q.data.transaction.cardMask ?? "—"} />
              <Field label="RRN" value={q.data.transaction.rrn ?? "—"} />
              <Field label="INT_REF" value={q.data.transaction.intRef ?? "—"} />
              <Field
                label="Создана"
                value={fmtDateTime(q.data.transaction.createdAt)}
              />
              <Field
                label="Обновлена"
                value={fmtDateTime(q.data.transaction.updatedAt)}
              />
            </dl>

            <Section title="Запрос (raw_request)">
              <JsonBlock data={q.data.transaction.rawRequest} />
            </Section>
            <Section title="Ответ/callback (raw_callback)">
              <JsonBlock data={q.data.transaction.rawCallback} />
            </Section>

            <Section title={`События (${q.data.events.length})`}>
              {q.data.events.length === 0 ? (
                <p className="text-[13px] text-grey-medium">Нет событий.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {q.data.events.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[rgba(102,112,133,0.2)] px-3 py-2 text-[13px]"
                    >
                      <span className="text-grey-medium">
                        {fmtDateTime(e.createdAt)}
                      </span>
                      <span className="font-medium text-[#0E131F]">
                        {kindLabel(e.kind)}
                      </span>
                      <OutcomeBadge outcome={e.outcome} />
                      {e.note && (
                        <span className="text-grey-medium">{e.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[12px] text-grey-medium">{label}</dt>
      <dd className="break-all text-[#0E131F]">{value}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold text-[#0E131F]">{title}</h3>
      {children}
    </div>
  );
}
