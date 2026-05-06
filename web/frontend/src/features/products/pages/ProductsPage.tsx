import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { SearchInput } from "../../../components/ui/SearchInput";
import { ProductsList } from "../components/ProductsList";
import { ProductFormDrawer } from "../components/ProductFormDrawer";
import { CategoriesDrawer } from "../components/CategoriesDrawer";
import { DeleteProductDialog } from "../components/DeleteProductDialog";
import { Pagination } from "../../../components/ui/Pagination";
import { PageActionButton } from "../../../components/ui/PageActionButton";
import { Select, type SelectOption } from "../../../components/ui/Select";
import {
  useCategories,
  useDeleteProduct,
  useProducts,
} from "../queries";
import { ApiError, type Product } from "../api";
import { mapError } from "../errors";

const PAGE_SIZE = 10;

export function ProductsPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const list = useProducts({
    q,
    page,
    pageSize: PAGE_SIZE,
    categoryId: categoryFilter,
  });
  const categories = useCategories();
  const remove = useDeleteProduct();

  const pageCount = useMemo(() => {
    if (!list.data) return 1;
    return Math.max(1, Math.ceil(list.data.total / PAGE_SIZE));
  }, [list.data]);

  const categoryOptions = useMemo<SelectOption<string>[]>(
    () =>
      (categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categories.data],
  );

  const noCategories =
    !categories.isLoading && (categories.data?.length ?? 0) === 0;

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }
  function openEdit(p: Product) {
    setEditTarget(p);
    setFormOpen(true);
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
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            className="w-[300px]"
          />
          <div className="w-[200px]">
            <Select<string>
              value={categoryFilter}
              onChange={(v) => {
                setCategoryFilter(v);
                setPage(1);
              }}
              options={categoryOptions}
              clearable
              placeholder="Категория"
            />
          </div>
          <PageActionButton
            variant="outline"
            onClick={() => setDrawerOpen(true)}
          >
            Редактировать категории
          </PageActionButton>
        </div>
        <PageActionButton
          onClick={openCreate}
          disabled={noCategories}
          title={noCategories ? "Сначала создайте категорию" : undefined}
          icon={<Plus size={20} strokeWidth={2} />}
        >
          Добавить товар
        </PageActionButton>
      </div>

      {list.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-4 text-[14px] text-red-error">
          Не удалось загрузить список товаров.
        </div>
      )}

      <ProductsList
        products={list.data?.products ?? []}
        loading={list.isLoading}
        onEdit={openEdit}
        onDelete={(p) => {
          setDeleteError(undefined);
          setDeleteTarget(p);
        }}
      />

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <ProductFormDrawer
        open={formOpen}
        product={editTarget}
        categories={categories.data ?? []}
        presetCategoryId={categoryFilter}
        onClose={() => {
          setFormOpen(false);
          setEditTarget(null);
        }}
      />

      <CategoriesDrawer
        open={drawerOpen}
        categories={categories.data ?? []}
        onClose={() => setDrawerOpen(false)}
      />

      <DeleteProductDialog
        product={deleteTarget}
        pending={remove.isPending}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
