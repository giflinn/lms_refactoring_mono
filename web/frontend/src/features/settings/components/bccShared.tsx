// Shared primitives for the BCC audit views (transactions + events tabs).
import clsx from "clsx";
import { auth } from "../../../firebase";

export async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fmtMoney(tenge: string | number): string {
  const n = typeof tenge === "string" ? Number(tenge) : tenge;
  if (Number.isNaN(n)) return String(tenge);
  return `${n.toLocaleString("ru-RU")} ₸`;
}

const CHIP = "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[12px] font-medium whitespace-nowrap";

const TXN_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Оплачено", cls: "bg-[#E7F6EC] text-[#1B7A43]" },
  pending: { label: "Ожидает", cls: "bg-[#FFF4E0] text-[#9A6700]" },
  failed: { label: "Ошибка", cls: "bg-[#FDECEC] text-[#B42318]" },
  refunded: { label: "Возврат", cls: "bg-[#EAF0FB] text-[#2B5BC4]" },
};

export function TxnStatusBadge({ status }: { status: string }) {
  const s = TXN_STATUS[status] ?? { label: status, cls: "bg-grey-lighter text-grey-dark" };
  return <span className={clsx(CHIP, s.cls)}>{s.label}</span>;
}

const OUTCOME: Record<string, { label: string; cls: string }> = {
  success: { label: "Успех", cls: "bg-[#E7F6EC] text-[#1B7A43]" },
  pending: { label: "Ожидает", cls: "bg-[#FFF4E0] text-[#9A6700]" },
  declined: { label: "Отклонено", cls: "bg-[#FDECEC] text-[#B42318]" },
  error: { label: "Ошибка", cls: "bg-[#FDECEC] text-[#B42318]" },
  unverified: { label: "Не верифиц.", cls: "bg-[#F3E8FB] text-[#7A3DB4]" },
};

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = OUTCOME[outcome] ?? { label: outcome, cls: "bg-grey-lighter text-grey-dark" };
  return <span className={clsx(CHIP, o.cls)}>{o.label}</span>;
}

const KIND_LABEL: Record<string, string> = {
  purchase_form: "Покупка (форма)",
  callback: "Callback",
  refund: "Возврат",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export function JsonBlock({ data }: { data: Record<string, string> | null }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-[13px] text-grey-medium">—</p>;
  }
  return (
    <pre className="max-h-[280px] overflow-auto rounded-[8px] bg-grey-lighter p-3 text-[12px] leading-[1.5] text-[#0E131F] whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between pt-3 text-[13px] text-grey-medium">
      <span>
        Всего: {total} · стр. {page} из {pages}
      </span>
      <div className="flex items-center gap-2">
        <PagerBtn disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Назад
        </PagerBtn>
        <PagerBtn disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Вперёд
        </PagerBtn>
      </div>
    </div>
  );
}

function PagerBtn({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-[6px] border border-[rgba(102,112,133,0.3)] bg-white px-3 py-1.5 font-medium text-grey-dark hover:bg-grey-lighter disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  );
}
