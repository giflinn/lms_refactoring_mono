# LMS Zhanna Slyamova

Monorepo containing:

- `mobile/` — Flutter mobile app
- `web/backend/` — Node.js + Express + TypeScript API (port `3000`)
- `web/frontend/` — React + Vite + TypeScript admin panel (port `5173`)
- `docker-compose.yml` — Postgres 16 (port `5432`)

## Database (Postgres in Docker)

```bash
docker compose up -d        # start postgres
docker compose ps           # status / health
docker compose logs -f      # tail logs
docker compose down         # stop (data persists in volume)
docker compose down -v      # stop AND wipe data volume
```

Connection string (already in `web/backend/.env.example`):

```
postgresql://lms:lms@localhost:5432/lms
```

On first run, copy env: `cp web/backend/.env.example web/backend/.env`.

## Web (pm2)

```bash
cd web
pm2 start ecosystem.config.js
pm2 logs           # tail logs
pm2 status         # process state
pm2 stop all       # stop both
pm2 delete all     # remove processes from pm2
```

Backend: http://localhost:3000 — frontend: http://localhost:5173

## Mobile (Flutter)

```bash
cd mobile
flutter run
```

## Sharing the admin on the local network

To let a colleague on the same Wi-Fi open the admin panel:

```bash
./share-admin.sh on      # binds Vite to 0.0.0.0 + points the browser bundle at the Mac's LAN IP
./share-admin.sh off     # restores localhost-only
./share-admin.sh         # status
```

`on` writes the LAN IP into `web/frontend/.env.local` (gitignored, takes
precedence over `.env`) and runs Vite under a temporary pm2 process named
`lms-frontend-share`. It also prints the matching `--dart-define=API_URL=…`
line for Flutter on a physical device (and copies it to the clipboard), so the
phone connected to the same Wi-Fi can use the same backend. `off` deletes
`.env.local` and brings the original `lms-frontend` process back.

Cafe Wi-Fi often isolates clients — if the colleague can't open the printed
URL, hotspot from a phone and put both laptops on it.
