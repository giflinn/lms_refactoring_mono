# LMS Zhanna Slyamova

Monorepo containing:

- `mobile/` — Flutter mobile app
- `web/backend/` — Node.js + Express + TypeScript API (port `3000`)
- `web/frontend/` — React + Vite + TypeScript admin panel (port `5173`)

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
