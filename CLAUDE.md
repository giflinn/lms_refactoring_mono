# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project nature

This is a **business application** with an LMS feature inside it — not a classical LMS. Future scope includes selling courses **and** physical/digital products. Don't bake LMS-only assumptions (student/teacher mental model, course-centric data flow) into shared layers like auth, navigation, or schema.

## Monorepo layout

- `mobile/` — Flutter app (Android + iOS only; web/macos/linux/windows platforms are intentionally git-ignored)
- `web/backend/` — Node + Express + TypeScript API on port 3000
- `web/frontend/` — Vite + React + TypeScript admin panel on port 5173
- `docker-compose.yml` — Postgres 16 on port 5432
- `design/tokens.json` — single source of truth for design tokens (colors, spacing, typography, radii). Mobile and web each import/codegen from this file.

See `README.md` for `docker compose`, `pm2`, and `flutter run` commands.

## Auth architecture

All auth is delegated to **Firebase Auth** (`lms-zhs-prod` project). There is no custom JWT issuing — do not add `jsonwebtoken` or `bcrypt`.

Flow:
1. Client (Flutter or React) authenticates with Firebase Auth → receives an ID token.
2. Client calls backend with `Authorization: Bearer <id_token>`.
3. Backend's `requireAuth` middleware (`web/backend/src/middleware/auth.ts`) verifies the token via `firebase-admin` and attaches `uid` + `email` to the request.
4. Our Postgres `users` table stores the app-side profile linked by `firebase_uid` (unique) — never a `password_hash`. Firebase owns credentials.
5. `POST /auth/sync` is the entry point that finds-or-creates a DB record after first sign-in. It accepts `multipart/form-data` carrying the rest of the registration profile (name, phone, manager code, terms, optional avatar file) on first call; subsequent calls (from login) just return the existing row.

The Firebase **service account JSON** lives at `web/backend/firebase-service-account.json` (gitignored). It must exist for the backend to boot when any code imports `src/firebase.ts`.

### Password reset is custom OTP, not Firebase magic-link

We deliberately did **not** use `sendPasswordResetEmail` from Firebase. The Figma flow requires a 6-digit code typed back into the app, which Firebase's link-based reset can't satisfy. Endpoints (in `web/backend/src/routes/passwordReset.ts`):

1. `POST /auth/password-reset/request` — generates a 6-digit code, hashes it (`SHA-256(code + email)`), emails it via SMTP. Anti-enumeration: returns `{ok: true}` even if the email isn't registered. Rate-limited (1/min, 5/hour per email).
2. `POST /auth/password-reset/verify` — checks the code, returns a short-lived `resetToken`. 5 wrong attempts invalidate the code.
3. `POST /auth/password-reset/complete` — uses the `resetToken` to update the Firebase user's password via `auth.updateUser()`, also sets `emailVerified=true` (the OTP receipt proves email ownership), and revokes refresh tokens.

When working in this area, do **not** "simplify" by switching to Firebase's link flow — the design and product intentionally diverge from it.

### SMTP

Outbound email goes through nodemailer. Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Without them, the password reset endpoint throws at runtime. See `web/backend/src/services/mailer.ts`.

### Avatar storage

Avatars are stored as files on disk in `web/backend/uploads/avatars/<firebase_uid>.<ext>` (gitignored) and served via `app.use('/avatars', express.static(...))`. We deliberately do **not** use Firebase Storage / S3 — this is the simplest thing that works for the VPS deploy. `users.avatarUrl` holds a relative path like `/avatars/abc123.jpg`.

## Roles

Enum `user_role`: `client`, `manager`, `senior_manager`, `admin`.

- **client** — end user; self-registers via the **mobile app**. Cannot log into web admin (block at login).
- **manager / senior_manager** — staff; created by an admin (admin UI not built yet).
- **admin** — full access; bootstrapped via `npm run seed:admin` in `web/backend` (one-shot on first deploy).

Each staff user (manager / senior_manager / admin) has a unique 6-digit `manager_code`. Clients can enter it during mobile registration to be linked to their manager via `users.manager_id`. If a client registers without a code, the backend falls back to the **oldest** staff user (by `created_at`) — so the seeded admin always picks up unlinked clients. Generate codes with `web/backend/src/services/managerCode.ts:generateUniqueManagerCode()`. The seed script prints the admin's code at the end of its output.

Mobile registration is open (creates `client`); web has **login only**.

## Database (Drizzle ORM)

Schema in `web/backend/src/db/schema.ts`. Migrations generated into `web/backend/drizzle/`.

```bash
cd web/backend
npm run db:generate     # diff schema -> SQL migration file
npm run db:migrate      # apply pending migrations
npm run db:push         # skip migration files; sync schema directly (dev only)
npm run db:studio       # browse DB in a UI
```

Always edit `schema.ts` first, then `db:generate` — never hand-write migration SQL.

## Backend (`web/backend`)

- Dev: `npm run dev` (uses `tsx watch --env-file=.env`)
- The `--env-file=.env` flag is load-bearing — without it `process.env.*` is empty and Firebase init throws.
- Add new env vars to **both** `.env` and `.env.example`.

## Frontend (`web/frontend`)

- Dev: `npm run dev`
- Vite env vars must be prefixed `VITE_` to be exposed to the browser. Firebase web config lives in `.env` as `VITE_FIREBASE_*` and is read in `src/firebase.ts`.

## Mobile (`mobile`)

- Dev: `flutter run` (or via your IDE)
- Bundle ID / package: `kz.zhannaslyamova.lms` (Android `applicationId` and iOS `PRODUCT_BUNDLE_IDENTIFIER`). After publishing to the stores this cannot change.
- Firebase is initialized in `main()` via `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)`. `lib/firebase_options.dart` is generated by `flutterfire configure` — re-run that CLI rather than editing it.
- State management: **Riverpod** (working assumption — confirm before introducing other state libs).
- **API URL** is resolved in `lib/core/network/api_client.dart` (`ApiClient.resolveBaseUrl`): defaults to `http://localhost:3000` on iOS sim and `http://10.0.2.2:3000` on Android emulator (Android can't see the host's `localhost`). Override at build time with `flutter run --dart-define=API_URL=...` for physical devices on the same Wi-Fi. Don't add `flutter_dotenv` — compile-time `--dart-define` is the convention here.
- **Mobile-side architecture** is documented in `mobile/CLAUDE.md`: feature-first layout (`lib/core/`, `lib/features/<x>/{data,domain,presentation}`), go_router for navigation, Riverpod everywhere, single `ApiClient` shared by all feature `*Api` classes. Read it before doing non-trivial mobile work.
- **iOS deployment target is 15.0** (in `Podfile` and `project.pbxproj`). Required by `firebase_auth`. Don't lower.
- **Splash screen** uses `flutter_native_splash` (config in `pubspec.yaml`). After changing `assets/logo_white.png` or splash config, regenerate with `dart run flutter_native_splash:create`. `main.dart` calls `FlutterNativeSplash.preserve()` at start and `.remove()` after init, with a 1500ms minimum visibility (via `_minSplashDuration`) so the splash isn't a sub-200ms flash on fast cold starts.
- **Launcher icons** use `flutter_launcher_icons` (config in `pubspec.yaml`). Source is `assets/icon.png`. After replacing, regenerate with `dart run flutter_launcher_icons`.
- **`google_sign_in_ios` is pinned via `dependency_overrides`** in `pubspec.yaml` to `5.7.8`. Newer 5.8+ pulls `GoogleSignIn 8.0` which depends on `GTMSessionFetcher ~> 3.3` — that conflicts with Firebase 12's `~> 5.x`, and `pod install` fails. Don't unpin without verifying the conflict is resolved upstream. If `Podfile.lock` ever gets stuck on this, delete it + `mobile/ios/Pods/` and re-run `pod install`.
- **Google Sign-In iOS plist + URL scheme:** `mobile/ios/Runner/GoogleService-Info.plist` must contain `CLIENT_ID` + `REVERSED_CLIENT_ID` (re-download from Firebase Console after enabling Google provider). The `REVERSED_CLIENT_ID` must also be registered in `Info.plist` under `CFBundleURLTypes` → `CFBundleURLSchemes`.
- **New Google users land on `complete_profile_page.dart`** to fill phone + manager code + terms (Google doesn't give us those). Existing users skip it and go straight to home.

## File size and decomposition

Soft cap **~300 lines** per file, hard signal at **~500**. When a file accumulates many sibling private widgets/classes/helpers, split it before adding more — the trigger is *length*, not "could-be-reused".

- **Flutter pages** (`mobile/lib/features/<x>/presentation/pages/*.dart`) should compose + hold state, not implement widgets. Extract subwidgets into `mobile/lib/features/<x>/presentation/widgets/<name>.dart`. Shared formatting helpers (Russian months, date formatting) go into `features/<x>/domain/` next to existing value objects.
- **React pages and drawers** (`web/frontend/src/features/<x>/components/*.tsx`, `pages/*.tsx`) — extract subcomponents into neighbor files. The page should be orchestration; reusable bits go beside it.
- **Backend route files** (`web/backend/src/routes/*.ts`) — extract complex validation/parsing/sub-feature logic into `services/`. A route handler stays thin: parse → validate → DB → respond. Per-route helper functions are fine inline; cross-route ones move to `services/`.

Keep helpers inline until a second caller exists (per the global "three similar lines beats premature abstraction" rule). The guidance above only fires when the file gets long — small files don't need pre-emptive splitting.

## Design system rule

There is one design source of truth: Figma + `design/tokens.json`. Mobile (Flutter) and web (React) cannot share component code, but they share tokens and naming conventions.

`design/build.mjs` is a pure-Node generator that reads `tokens.json` and emits three artifacts: `web/frontend/src/design/tokens.ts`, `web/frontend/src/design/tokens.css` (Tailwind v4 `@theme` block), and `mobile/lib/core/design/tokens.dart` (`AppColors` class). Run with `npm run design:build` from `web/frontend` after editing `tokens.json`. Don't hand-edit the generated files — they're overwritten.

Web styling: **Tailwind v4 + `@tailwindcss/vite`**, CSS-first config. Tokens become Tailwind utilities automatically via the `@theme` block in `tokens.css` (e.g. `--color-purple-dark` → `bg-purple-dark`).

**Before creating a new UI component on either client, search the existing components folder first** (mobile: `lib/core/widgets/` for cross-feature, `lib/features/<x>/presentation/widgets/` for feature-scoped; web: `web/frontend/src/components/`). If a similar component exists, extend or reuse — do not duplicate. If you must create one, design its API to be reusable, not hyper-specific to the current screen.

## Environments and deploy

- **No dev/staging/prod split in code.** Single `.env` per machine, single `docker-compose.yml`, single deploy target. Don't introduce `config.dev.ts` / `config.prod.ts`, per-env Docker overrides, or `NODE_ENV` branching.
- **No CI/CD.** No GitHub Actions, no husky/lint-staged, no pre-commit hooks. Don't propose them.
- Deploy target: VPS at `app.zhannaslyamova.net` (`185.98.7.174`). Ubuntu 24.04, 1.9 GB RAM + 2 GB swap, single host: Nginx serves the React static bundle, proxies `/api/` → backend on `:3000` (pm2), Postgres in Docker. SSL via Let's Encrypt. **Operational runbook: `.claude/skills/prod/SKILL.md`** — read before any deploy / log dive / DB op.
- Pre-launch exception: a separate `lms-zhs-dev` Firebase project exists but is unused. Before the first store release, switch dev work to it so test users don't pollute prod (Firebase UIDs cannot be migrated between projects).

## Keeping this file fresh

Update CLAUDE.md when a change introduces something a future session **wouldn't discover from reading the code or commit history**:

- A new architectural decision or stack choice (and why it won over the alternative)
- A non-obvious convention or "do this because of past incident" rule
- A new directive about what NOT to do
- A new external integration, env var, or secret location
- A change that invalidates something already written here (then edit, don't append)

Do **not** update it for: bug fixes, new routes, new components, new tables, new dependencies, refactors. Those are visible in the diff and don't need a guidebook entry. Adding an entry per commit makes this file rot.

## What not to add

- `jsonwebtoken`, `bcrypt`, custom JWT signing — auth is Firebase, not us.
- Auth providers like Clerk / Auth0 / Supabase.
- Per-environment config files or env-aware build matrices.
- A component library (Material UI, Chakra, etc.) on the web side without asking — admin UI is built from Figma to match, default to Tailwind + custom components.
- Speculative abstractions for "future flexibility" — three similar lines beats a premature abstraction.
