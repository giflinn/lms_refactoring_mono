import { Trash2 } from "lucide-react";
import type { Product } from "../api";

const apiBase = import.meta.env.VITE_API_URL as string;

function resolveCoverSrc(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("/") ? `${apiBase}${path}` : path;
}

type Props = {
  products: Product[];
  loading: boolean;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
};

export function ProductsList({ products, loading, onEdit, onDelete }: Props) {
  if (!loading && products.length === 0) {
    return (
      <div className="rounded-[12px] border border-[#EAECF0] bg-white py-12 text-center text-[14px] text-grey-medium">
        Пока нет товаров. Добавьте первый.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {products.map((p) => (
        <ProductRow
          key={p.id}
          product={p}
          onEdit={() => onEdit(p)}
          onDelete={() => onDelete(p)}
        />
      ))}
    </div>
  );
}

function ProductRow({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const coverSrc = resolveCoverSrc(product.coverImageUrl);
  return (
    <div className="flex items-center gap-4 rounded-[12px] bg-white p-4 shadow-[0_2px_4px_rgba(16,24,40,0.05),0_4px_8px_rgba(16,24,40,0.05)]">
      <div
        className="flex h-[48px] w-[48px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] text-[10px] font-medium text-white"
        style={{
          background: coverSrc
            ? undefined
            : "linear-gradient(180deg, #C147E9 0%, #2D033B 100%)",
        }}
      >
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span>Превью</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <p className="truncate text-[15px] font-medium text-[#0E131F]">
          {product.title}
        </p>
        <div className="flex items-center gap-2 text-[12px] text-grey-medium">
          {product.category && <span>{product.category.name}</span>}
          {product.category && <span>•</span>}
          <span>{formatPrice(product.price)}</span>
          {!product.isActive && (
            <>
              <span>•</span>
              <span className="text-red-error">Неактивный</span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[13px] font-medium text-[#0E131F] hover:bg-grey-lighter"
      >
        Редактировать
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="cursor-pointer rounded-[8px] p-2 text-grey-medium hover:bg-grey-lighter hover:text-red-error"
        aria-label="Удалить"
      >
        <Trash2 size={20} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function formatPrice(price: string | null): string {
  if (price == null) return "По запросу";
  const n = Number(price);
  if (!Number.isFinite(n)) return `${price} ₸`;
  return `${Math.round(n).toLocaleString("ru-RU")} ₸`;
}
