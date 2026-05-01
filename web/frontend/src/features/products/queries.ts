import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  renameCategory,
  updateProduct,
  type ProductInput,
} from "./api";

const PRODUCTS_KEY = "products" as const;
const CATEGORIES_KEY = "product-categories" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

// Categories ---------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: [CATEGORIES_KEY] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listCategories(token);
    },
  });
}

function useInvalidateCategories() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [CATEGORIES_KEY] });
    // Renaming a category changes the embedded `category.name` on every
    // product card, so refresh the products list too.
    qc.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
  };
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async (name: string) => {
      const token = await getIdToken();
      return createCategory(token, name);
    },
    onSuccess: () => invalidate(),
  });
}

export function useRenameCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async (vars: { id: string; name: string }) => {
      const token = await getIdToken();
      return renameCategory(token, vars.id, vars.name);
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getIdToken();
      await deleteCategory(token, id);
    },
    onSuccess: () => invalidate(),
  });
}

// Products -----------------------------------------------------------------

export function useProducts(params: {
  q?: string;
  page: number;
  pageSize: number;
  categoryId?: string | null;
}) {
  return useQuery({
    queryKey: [PRODUCTS_KEY, params] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listProducts(token, params);
    },
    placeholderData: (prev) => prev,
  });
}

function useInvalidateProducts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    // Product CRUD changes per-category counts shown in the drawer.
    qc.invalidateQueries({ queryKey: [CATEGORIES_KEY] });
  };
}

export function useCreateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      const token = await getIdToken();
      return createProduct(token, input);
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async (vars: { id: string; input: ProductInput }) => {
      const token = await getIdToken();
      return updateProduct(token, vars.id, vars.input);
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getIdToken();
      await deleteProduct(token, id);
    },
    onSuccess: () => invalidate(),
  });
}
