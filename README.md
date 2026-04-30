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
