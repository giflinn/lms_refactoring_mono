# Backend (Node + Express + TS) — Agent Conventions

Read alongside the root `CLAUDE.md` (auth architecture, deploy model, role
enum, design tokens). This file is backend-specific.

## Folder layout

```
src/
├── index.ts              # bootstrap: middleware, routers, error handler, listen
├── config.ts             # single source of truth for env vars; fails fast on missing required
├── firebase.ts           # firebase-admin init (reads config.firebaseServiceAccountPath)
├── db/
│   ├── index.ts          # drizzle client (reads config.databaseUrl)
│   └── schema.ts         # all tables + enums; edit here, then `npm run db:generate`
├── middleware/
│   └── auth.ts           # requireAuth — verifies Firebase ID token, populates req.uid + req.email
├── routes/
│   └── <feature>.ts      # express.Router() per feature; one file ≈ one URL prefix
├── services/
│   └── <name>.ts         # reusable business logic shared across routes (mailer, otp, validation, …)
└── scripts/
    └── seed-admin.ts     # one-shot ops scripts run via tsx
```

Files are flat by purpose, not nested feature-folders. Promote to feature
folders only when `routes/` or `services/` exceeds ~10 files.

## Adding a new env var

1. Add the field to `src/config.ts`. Pick `required(...)` if the app can't boot
   without it, or plain `process.env.X` if it's optional / per-feature.
2. Add the same key to `.env.example` (with a placeholder + comment if the
   meaning isn't obvious from the name).
3. Set it in your local `.env`.
4. **Never read `process.env.X` directly outside `config.ts`.** It bypasses the
   startup validation and makes missing vars fail at the worst time.

## Adding a new route

1. Create `src/routes/<feature>.ts` exporting an `express.Router()`.
2. Register it in `src/index.ts`: `app.use(featureRouter)`.
3. Wrap async handlers with try/catch → `next(err)`. The global error handler
   in `index.ts` returns `{error: "internal_error"}` on uncaught throws.
4. Use `requireAuth` middleware on routes that need an authenticated user.
   It populates `req.uid` and `req.email` from the verified Firebase ID token.
5. **Error response shape is `{error: "<snake_case_code>"}`.** The mobile app
   switches on these codes to render field-specific UI errors — see
   `mobile/lib/features/auth/presentation/pages/register_page.dart` for the
   pattern. Never put human-readable messages in `error`; that's UI's job.

## Adding a new service

`services/` holds reusable logic that doesn't belong to one HTTP route — OTP
generation, email sending, validation, file upload config. Pure functions or
small classes; no Express coupling unless wrapping middleware (like
`avatarUpload`).

## Database

- Edit `src/db/schema.ts`. **Never hand-write migration SQL.**
- `npm run db:generate` — diff the schema against the last migration to
  produce a new SQL file in `drizzle/`.
- `npm run db:migrate` — apply pending migrations.
- `npm run db:push` — sync schema to DB without writing a migration file. Dev
  only; never on prod.
- `npm run db:studio` — browse the DB.

When adding a column with `notNull`, give it `.default(...)` or write a
migration that backfills, otherwise `db:migrate` fails on rows that exist.

## Validation

Validators live in `services/validation.ts`. The same regexes are mirrored
in:
- `mobile/lib/features/auth/domain/validation.dart` (Flutter)
- frontend has its own copies inline (small, may be promoted to a shared module
  if the count grows)

If you change a validator on one side, update **all three** sides. The
`validation.ts` comment block lists the rules; treat it as the spec.

## Security

- **Never use `Math.random()` for anything user-facing.** OTP codes, manager
  codes, reset tokens — all CSPRNG (`crypto.randomInt` or `crypto.randomBytes`).
  Past incident: initial OTP code generator used `Math.random()`. Predictable.
  Fixed; don't reintroduce.
- **Never store plain OTP / passwords.** OTP is `SHA-256(code + email)` (the
  email salts so leaked hashes can't be replayed across accounts). Passwords
  are owned by Firebase — we never see them.
- **Anti-enumeration**: endpoints that take an email and reveal whether it's
  registered must return `{ok: true}` either way (see
  `/auth/password-reset/request`). Same rule for any future
  forgot-username / account-lookup endpoint.
- **No `jsonwebtoken`, no `bcrypt`.** Auth is Firebase. Password verification,
  ID token signing — all Firebase. We only verify ID tokens via firebase-admin.

## Common pitfalls

- **`next(err)` → 500 by default**, not your custom status. The global error
  handler returns 500 for unknown errors. If you want 400/404, write
  `res.status(400).json({error: "..."})` directly inside the route.
- **Async middleware throws are caught** (Express 5+) but make sure to use
  `try/catch + next(err)` for cleanest error flow. We're on Express 4 — async
  errors that escape will crash the request unless wrapped.
- **`req.body` is `undefined` on multipart requests until multer runs.** If you
  read body fields, attach `avatarUpload.single("…")` (or similar) **before**
  your handler in the route chain.
- **firebase-admin singleton**: `firebaseApp` is initialised once on first
  import of `firebase.ts`. Don't call `admin.initializeApp(...)` anywhere else.
- **Drizzle self-FK**: when a column references the same table, you need the
  `(): AnyPgColumn => ...` thunk (see `users.managerId` in schema.ts).

## What NOT to do

- Don't add `jsonwebtoken`, `bcrypt`, or any auth library.
- Don't add `helmet` / `morgan` / `express-rate-limit` without a concrete
  threat — the OTP flow has its own per-email rate limit.
- Don't introduce env-aware config (no `config.dev.ts` / `config.prod.ts`).
  Single `.env`, single `config.ts`. Per root CLAUDE.md.
- Don't write migration SQL by hand — always go through `db:generate`.
- Don't read `process.env.X` outside `config.ts`.
- Don't use `Math.random()` for tokens, codes, or anything security-relevant.
- Don't return human-readable strings in `{error: ...}`. Snake_case codes only.

## Testing

No tests yet. When adding them, the testable surfaces are:
- `services/*` — pure functions, easiest to unit-test (validation, OTP hashing,
  managerCode generator with mock db).
- `routes/*` — integration tests with `supertest` against a test DB.
- Don't mock Firebase admin; use the Firebase Auth Emulator if needed.
