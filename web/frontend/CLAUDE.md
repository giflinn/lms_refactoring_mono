# Frontend (Vite + React 19 + TS) — Agent Conventions

Read alongside the root `CLAUDE.md` (auth architecture, role gating: only
staff can sign in here; design tokens). This file is admin-panel-specific.

## Folder layout

```
src/
├── main.tsx                  # bootstrap: ErrorBoundary > QueryClientProvider > BrowserRouter > App
├── App.tsx                   # <Routes> + auth-state guards
├── ErrorBoundary.tsx         # top-level safety net for runtime React errors
├── firebase.ts               # firebase web SDK init
├── api/
│   ├── client.ts             # apiClient — shared fetch wrapper (baseUrl, auth header, NetworkException)
│   └── exceptions.ts         # NetworkException
├── auth/
│   ├── AuthContext.tsx       # AuthProvider + useAuth + AccessDeniedError
│   ├── api.ts                # auth-feature endpoints (fetchMe)
│   └── guards.tsx            # RequireAuth, RequireGuest route wrappers
├── components/
│   ├── Logo.tsx              # cross-app brand
│   └── ui/                   # generic primitives (Button, Input)
├── design/tokens.ts          # codegen target — do NOT edit by hand
└── pages/                    # one file per route component
```

When the app grows past ~5 pages, switch to feature-folder layout (mirroring
mobile): `features/<x>/{api, components, pages, hooks}`. Don't preempt — it's
overhead until there's something to split.

## Routing — react-router-dom v6

- All routes live in `App.tsx`.
- Auth gating uses `<RequireAuth>` / `<RequireGuest>` from `auth/guards.tsx`.
  Don't write manual `if (!user) return <Navigate ...>` inside pages.
- Navigate programmatically with `useNavigate()` from `react-router-dom`.
- For dynamic params, use `useParams()`.

## Server state — TanStack Query

The QueryClient is set up in `main.tsx` with a 30s default `staleTime`. Use
React Query for **anything that comes from the backend** — lists, details,
mutations. Don't roll your own `useEffect + useState + fetch`.

Convention per feature:

```ts
// src/auth/queries.ts (or features/users/queries.ts later)
export const usersQueryKey = ["users"] as const;

export function useUsers(idToken: string) {
  return useQuery({
    queryKey: usersQueryKey,
    queryFn: async () => {
      const res = await apiClient.get("/users", idToken);
      if (!res.ok) throw new Error(`GET /users: ${res.status}`);
      return (await res.json()).users as User[];
    },
  });
}
```

Mutations:

```ts
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NewUser) => { /* ... */ },
    onSuccess: () => qc.invalidateQueries({ queryKey: usersQueryKey }),
  });
}
```

`AuthContext.fetchMe` doesn't use react-query because it runs once per
`onAuthStateChanged` cycle, not on demand. Keep it as-is.

## API calls

- **Always go through `apiClient`** from `api/client.ts`. Don't import `fetch`
  directly anywhere except inside `client.ts`.
- The client wraps low-level network errors as `NetworkException`. Catch it to
  render "Нет соединения с сервером". HTTP status interpretation
  (200 vs 4xx/404 etc) is per-endpoint.
- Backend errors come back as `{error: "<snake_case_code>"}`. Switch on the
  code to render field-specific UI errors. Use `ApiClient.parseErrorCode(res)`
  to extract.

## Adding a new page

1. Create `src/pages/MyPage.tsx`.
2. Register in `App.tsx`:
   ```tsx
   <Route path="/my-path" element={<RequireAuth><MyPage /></RequireAuth>} />
   ```
3. If the page fetches data, use a `useXyz` query hook (see TanStack Query
   section above) — don't `useEffect + fetch`.

## Adding a new env var

1. Add `VITE_*` to `.env.example`.
2. Set it locally in `.env`.
3. Read it via `import.meta.env.VITE_*`. Vite inlines these at build time.
4. **Only `VITE_`-prefixed vars are exposed to the browser.** Anything else
   stays server-side (in `web/backend`).

## Validation

Inline regexes in pages are OK while there's only login. When a second form
appears that uses the same rules (email, password, phone, manager code),
extract to `src/lib/validation.ts` and mirror `mobile/lib/features/auth/domain/validation.dart`
+ `web/backend/src/services/validation.ts` exactly. All three sides must
agree on the regex.

## Forms

Hand-rolled `useState + onChange + setError` is fine for the current single
form. Once a third form appears, introduce **react-hook-form + zod** in one
go — don't pile up a fourth handcrafted form.

## Components

- Generic primitives (`Button`, `Input`, future `Modal`, `Dropdown`, `Table`)
  live in `components/ui/`.
- Brand / cross-feature components (`Logo`) live in `components/`.
- Page-specific composition stays inside the page file until it's used twice.
- We don't use Material UI / Chakra / shadcn (per root CLAUDE.md). All
  components are Tailwind v4 + custom, built to match Figma.

## Design tokens

- `design/tokens.ts` (and `tokens.css`) are codegen'd from `design/tokens.json`.
- Run `npm run design:build` after editing tokens.
- Don't hand-edit `tokens.ts` or `tokens.css`.
- Tailwind utilities map automatically from the `@theme` block: `--color-purple-dark`
  → `bg-purple-dark`, `text-purple-dark`, etc.

## Common pitfalls

- **`apiClient` throws on module load** if `VITE_API_URL` is missing. That's
  intentional (fail fast, clear message) — make sure `.env` has it.
- **react-router redirects don't unmount mid-fetch** — if a query is in
  flight and the route changes, the response still arrives. Cancel via
  `signal` if it matters (or just let it land; React Query handles staleness).
- **`onAuthStateChanged` fires once on mount** — until it does, `loading=true`.
  All guards show the loading screen during this window.

## What NOT to do

- Don't add Redux / Zustand / MobX. Server state is React Query, local state
  is `useState` / `useReducer`. That covers everything an admin panel needs.
- Don't add a UI kit (MUI / Chakra / Mantine / shadcn) without explicit user
  approval — designs come from Figma.
- Don't read `import.meta.env.VITE_API_URL` outside `api/client.ts`.
- Don't use `fetch` directly outside `api/client.ts`.
- Don't `useEffect + fetch` for server data — use React Query.
- Don't write inline-styled components when a Tailwind class works.
- Don't copy validation regexes — extract to `lib/validation.ts` and keep in
  sync with mobile + backend.
