import { ApiClient, apiClient } from "../../api/client";

export type LegalSlug = "about" | "privacy" | "terms" | "offer";

export const LEGAL_SLUGS: readonly LegalSlug[] = [
  "about",
  "privacy",
  "terms",
  "offer",
] as const;

export const LEGAL_LABELS: Record<LegalSlug, string> = {
  about: "О нас",
  privacy: "Политика конфиденциальности",
  terms: "Условия использования",
  offer: "Публичная оферта",
};

export type LegalSummary = {
  slug: LegalSlug;
  title: string;
  updatedAt: string;
};

export type LegalDocument = {
  slug: LegalSlug;
  title: string;
  contentHtml: string;
  updatedAt: string;
};

export class LegalApiError extends Error {
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
  const code = await ApiClient.parseErrorCode(res.clone());
  throw new LegalApiError(code, res.status);
}

export async function listLegal(): Promise<LegalSummary[]> {
  const res = await apiClient.get("/legal");
  await ensureOk(res);
  const body = (await res.json()) as { documents: LegalSummary[] };
  return body.documents;
}

export async function getLegal(slug: LegalSlug): Promise<LegalDocument> {
  const res = await apiClient.get(`/legal/${slug}`);
  await ensureOk(res);
  const body = (await res.json()) as { document: LegalDocument };
  return body.document;
}

export async function updateLegal(
  idToken: string,
  slug: LegalSlug,
  payload: { title?: string; contentHtml: string },
): Promise<void> {
  const res = await apiClient.patchJson(`/legal/${slug}`, payload, idToken);
  await ensureOk(res);
}
