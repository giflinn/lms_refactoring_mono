import { NetworkException } from "./exceptions";

/**
 * Thin wrapper around `fetch` that all feature APIs use. Owns:
 * - the base URL (from VITE_API_URL)
 * - the auth header convention (`Authorization: Bearer <id_token>`)
 * - mapping low-level network errors to NetworkException
 *
 * Status-code interpretation (200 vs 4xx vs 404 etc) is left to the caller
 * because each endpoint decides what its errors mean. Returns the raw
 * Response so callers can inspect status / headers / body type.
 */
class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  get(path: string, idToken?: string): Promise<Response> {
    return this.send("GET", path, { idToken });
  }

  postJson(path: string, body: unknown, idToken?: string): Promise<Response> {
    return this.send("POST", path, { idToken, body });
  }

  private async send(
    method: string,
    path: string,
    opts: { idToken?: string; body?: unknown },
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (opts.idToken) headers.Authorization = `Bearer ${opts.idToken}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      // fetch throws TypeError on transport failure (DNS, connection refused,
      // CORS preflight rejection). Anything that isn't an HTTP response means
      // we never talked to the server.
      throw new NetworkException();
    }
  }

  /**
   * Tries to extract `error` from a JSON body; returns 'unknown_error' on
   * any parse failure. Useful for translating backend error codes to UI.
   */
  static async parseErrorCode(res: Response): Promise<string> {
    try {
      const json = (await res.json()) as { error?: string };
      return json.error ?? "unknown_error";
    } catch {
      return "unknown_error";
    }
  }
}

const baseUrl = import.meta.env.VITE_API_URL;
if (!baseUrl) {
  throw new Error(
    "VITE_API_URL is not set. Add it to web/frontend/.env (see .env.example).",
  );
}

export const apiClient = new ApiClient(baseUrl);
export { ApiClient };
