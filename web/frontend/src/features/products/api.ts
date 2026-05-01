import { ApiClient, apiClient } from "../../api/client";

export type ProductCoverKind = "preset" | "custom_bg" | "custom_full";

export type ProductCategory = {
  id: string;
  name: string;
  productCount: number;
  createdAt: string;
};

export type ProductCategorySummary = {
  id: string;
  name: string;
};

export type Product = {
  id: string;
  categoryId: string;
  category: ProductCategorySummary | null;
  title: string;
  description: string;
  buttonText: string;
  // numeric column → comes back as a string. null = "по запросу".
  price: string | null;
  daysUntilCancel: number;
  isPromo: boolean;
  isActive: boolean;
  isTopSearch: boolean;
  coverKind: ProductCoverKind;
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductsList = {
  products: Product[];
  page: number;
  pageSize: number;
  total: number;
};

// Form-side payload — picked apart into FormData when sent.
export type ProductInput = {
  categoryId: string;
  title: string;
  description: string;
  buttonText: string;
  // Pre-formatted decimal string ("1500" or "1500.00") or null for "по запросу".
  price: string | null;
  daysUntilCancel: number;
  isPromo: boolean;
  isActive: boolean;
  isTopSearch: boolean;
  coverKind: ProductCoverKind;
  // Only set when the user picked a new file in this submit. Existing image
  // on the server is kept if this is null AND coverKind is unchanged.
  coverFile: File | null;
};

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  const code = await ApiClient.parseErrorCode(res);
  throw new ApiError(code, res.status);
}

// Categories ---------------------------------------------------------------

export async function listCategories(
  idToken: string,
): Promise<ProductCategory[]> {
  const res = await apiClient.get("/product-categories", idToken);
  await ensureOk(res);
  const body = (await res.json()) as { categories: ProductCategory[] };
  return body.categories;
}

export async function createCategory(
  idToken: string,
  name: string,
): Promise<ProductCategory> {
  const res = await apiClient.postJson(
    "/product-categories",
    { name },
    idToken,
  );
  await ensureOk(res);
  const body = (await res.json()) as { category: ProductCategory };
  return body.category;
}

export async function renameCategory(
  idToken: string,
  id: string,
  name: string,
): Promise<ProductCategory> {
  const res = await apiClient.patchJson(
    `/product-categories/${id}`,
    { name },
    idToken,
  );
  await ensureOk(res);
  const body = (await res.json()) as { category: ProductCategory };
  return body.category;
}

export async function deleteCategory(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/product-categories/${id}`, idToken);
  await ensureOk(res);
}

// Products -----------------------------------------------------------------

export async function listProducts(
  idToken: string,
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
    categoryId?: string | null;
  } = {},
): Promise<ProductsList> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.page) usp.set("page", String(params.page));
  if (params.pageSize) usp.set("pageSize", String(params.pageSize));
  if (params.categoryId) usp.set("categoryId", params.categoryId);
  const qs = usp.toString();
  const path = qs ? `/products?${qs}` : "/products";
  const res = await apiClient.get(path, idToken);
  await ensureOk(res);
  return (await res.json()) as ProductsList;
}

function toFormData(input: ProductInput, partial: boolean): FormData {
  const fd = new FormData();
  // Always send everything on create; on update we send the same fields, the
  // backend treats it as a partial patch where every present field overwrites.
  fd.append("categoryId", input.categoryId);
  fd.append("title", input.title);
  fd.append("description", input.description);
  fd.append("buttonText", input.buttonText);
  fd.append("price", input.price ?? "");
  fd.append("daysUntilCancel", String(input.daysUntilCancel));
  fd.append("isPromo", input.isPromo ? "true" : "false");
  fd.append("isActive", input.isActive ? "true" : "false");
  fd.append("isTopSearch", input.isTopSearch ? "true" : "false");
  fd.append("coverKind", input.coverKind);
  if (input.coverFile) fd.append("cover", input.coverFile);
  // Touch `partial` so TS doesn't complain about the unused param — it stays
  // in the signature in case we later need different shapes per mode.
  void partial;
  return fd;
}

export async function createProduct(
  idToken: string,
  input: ProductInput,
): Promise<Product> {
  const res = await apiClient.postFormData(
    "/products",
    toFormData(input, false),
    idToken,
  );
  await ensureOk(res);
  const body = (await res.json()) as { product: Product };
  return body.product;
}

export async function updateProduct(
  idToken: string,
  id: string,
  input: ProductInput,
): Promise<Product> {
  // Express only handles multipart on POST in our client; PATCH multipart
  // requires a tweak — use method override via a dedicated helper.
  const res = await apiClient.patchFormData(
    `/products/${id}`,
    toFormData(input, true),
    idToken,
  );
  await ensureOk(res);
  const body = (await res.json()) as { product: Product };
  return body.product;
}

export async function deleteProduct(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/products/${id}`, idToken);
  await ensureOk(res);
}
