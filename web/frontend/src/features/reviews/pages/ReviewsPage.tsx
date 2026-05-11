import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchInput } from "../../../components/ui/SearchInput";
import { SegmentedTabs } from "../../../components/ui/SegmentedTabs";
import { Pagination } from "../../../components/ui/Pagination";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { Avatar } from "../../../components/Avatar";
import { auth } from "../../../firebase";
import { listClients } from "../../clients/api";
import { useReviews } from "../queries";
import type { ReviewListItem, ReviewStatus } from "../api";
import { ReviewsTable } from "../components/ReviewsTable";
import { ReviewDrawer } from "../components/ReviewDrawer";

const PAGE_SIZE = 10;

type TabId = "all" | "pending" | "published";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "pending", label: "На рассмотрении" },
  { id: "published", label: "Опубликованные" },
];

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

function tabToStatus(tab: TabId): ReviewStatus | null {
  return tab === "all" ? null : tab;
}

export function ReviewsPage() {
  const [tab, setTab] = useState<TabId>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [drawerReview, setDrawerReview] = useState<ReviewListItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const clientsQuery = useQuery({
    queryKey: ["reviews-clients-dropdown"] as const,
    queryFn: async () => {
      const token = await getIdToken();
      const res = await listClients(token, { pageSize: 50 });
      return res.clients;
    },
  });

  const list = useReviews({
    q,
    page,
    pageSize: PAGE_SIZE,
    status: tabToStatus(tab),
    clientId: clientFilter,
  });

  const pageCount = useMemo(() => {
    if (!list.data) return 1;
    return Math.max(1, Math.ceil(list.data.total / PAGE_SIZE));
  }, [list.data]);

  const clientOptions = useMemo<SelectOption<string>[]>(() => {
    return (clientsQuery.data ?? []).map((c) => ({
      value: c.id,
      label: `${c.firstName} ${c.lastName}`.trim() || c.email,
      leading: (
        <Avatar
          src={c.avatarUrl}
          firstName={c.firstName}
          lastName={c.lastName}
          email={c.email}
          size={28}
        />
      ),
    }));
  }, [clientsQuery.data]);

  // When the list refetches (e.g. after moderate/reply), refresh the drawer's
  // snapshot from the fresh server data so replies show real author info.
  const refreshedDrawerReview = useMemo<ReviewListItem | null>(() => {
    if (!drawerReview) return null;
    const fresh = list.data?.reviews.find((r) => r.id === drawerReview.id);
    return fresh ?? drawerReview;
  }, [drawerReview, list.data]);

  function handleOpen(r: ReviewListItem) {
    setDrawerReview(r);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <SegmentedTabs<TabId>
        tabs={TABS}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
        className="self-start"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Поиск по клиенту или товару"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          className="w-[300px]"
        />
        <div className="w-[200px]">
          <Select<string>
            value={clientFilter}
            onChange={(v) => {
              setClientFilter(v);
              setPage(1);
            }}
            options={clientOptions}
            searchable
            clearable
            placeholder="Клиент"
          />
        </div>
      </div>

      {list.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-4 text-[14px] text-red-error">
          Не удалось загрузить отзывы.
        </div>
      )}

      <ReviewsTable
        reviews={list.data?.reviews ?? []}
        onOpen={handleOpen}
      />

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <ReviewDrawer
        review={refreshedDrawerReview}
        open={drawerOpen}
        onClose={closeDrawer}
      />
    </div>
  );
}
