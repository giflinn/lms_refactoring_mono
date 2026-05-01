#!/usr/bin/env bash
# Open the admin panel to other devices on the local Wi-Fi (e.g. a colleague's
# laptop). Two things have to change vs. the default localhost-only setup:
#   1. Vite must bind to 0.0.0.0 (we pass --host on the CLI; vite.config.ts
#      stays untouched, the flag wins).
#   2. The browser-side VITE_API_URL must point at the Mac's LAN IP, not
#      localhost — otherwise the colleague's browser hits THEIR own machine.
#      We write this to web/frontend/.env.local (gitignored, takes precedence
#      over .env).
#
# Usage:
#   ./share-admin.sh on    # start sharing — prints URL for the colleague
#   ./share-admin.sh off   # stop sharing — restores localhost-only setup
#   ./share-admin.sh       # show status
#
# AP-isolation gotcha: many cafe Wi-Fis block client-to-client traffic. If the
# colleague's laptop can't reach the URL, hotspot from a phone and connect
# both Macs through it.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_LOCAL="${ROOT_DIR}/web/frontend/.env.local"
PORT_BACKEND=3000
PORT_FRONTEND=5173
SHARE_PROC_NAME="lms-frontend-share"

mode="${1:-status}"

current_ip() {
  local ip=""
  for IF in en0 en1 en2 en3; do
    ip="$(ipconfig getifaddr "$IF" 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  done
  return 1
}

case "$mode" in
  on)
    IP="$(current_ip || true)"
    if [[ -z "$IP" ]]; then
      echo "✗ нет активного Wi-Fi интерфейса (en0–en3)" >&2
      exit 1
    fi

    echo "VITE_API_URL=http://${IP}:${PORT_BACKEND}" > "$ENV_LOCAL"

    pm2 stop lms-frontend >/dev/null 2>&1 || true
    pm2 delete "$SHARE_PROC_NAME" >/dev/null 2>&1 || true

    pm2 start npm \
      --name "$SHARE_PROC_NAME" \
      --cwd "${ROOT_DIR}/web/frontend" \
      -- run dev -- --host >/dev/null

    sleep 1
    echo
    echo "✓ админка открыта на сеть"
    echo
    echo "  IP        : ${IP}"
    echo "  Frontend  : http://${IP}:${PORT_FRONTEND}"
    echo "  Backend   : http://${IP}:${PORT_BACKEND} (.env.local указывает сюда)"
    echo
    echo "  Дай коллеге: http://${IP}:${PORT_FRONTEND}"
    echo

    DART_DEFINE="--dart-define=API_URL=http://${IP}:${PORT_BACKEND}"
    if curl -sf --max-time 2 "http://${IP}:${PORT_BACKEND}/api/health" >/dev/null; then
      backend_status="✓ ${PORT_BACKEND} отвечает"
    else
      backend_status="✗ ${PORT_BACKEND} не отвечает — проверь pm2/firewall"
    fi
    echo "Для физического телефона (Flutter) — ${backend_status}"
    echo "  Xcode → Edit Scheme → Run → Arguments Passed On Launch:"
    echo "      ${DART_DEFINE}"
    echo "  Или из терминала:"
    echo "      flutter run ${DART_DEFINE}"
    if command -v pbcopy >/dev/null 2>&1; then
      printf "%s" "${DART_DEFINE}" | pbcopy
      echo "  (dart-define скопирован в буфер обмена — ⌘V)"
    fi
    echo
    echo "Когда закончите: ./share-admin.sh off"
    ;;

  off)
    pm2 delete "$SHARE_PROC_NAME" >/dev/null 2>&1 || true
    rm -f "$ENV_LOCAL"
    pm2 start lms-frontend >/dev/null 2>&1 || \
      pm2 start "${ROOT_DIR}/web/ecosystem.config.js" --only lms-frontend >/dev/null

    echo "✓ всё вернулось на localhost-only:"
    echo "    .env.local удалён"
    echo "    pm2 lms-frontend снова на localhost:5173"
    ;;

  status)
    if [[ -f "$ENV_LOCAL" ]]; then
      echo "ON: $(cat "$ENV_LOCAL")"
      pm2 describe "$SHARE_PROC_NAME" >/dev/null 2>&1 \
        && echo "    pm2 process: $SHARE_PROC_NAME (online)" \
        || echo "    pm2 process: $SHARE_PROC_NAME отсутствует — запусти ./share-admin.sh on"
    else
      echo "OFF (localhost-only)"
    fi
    ;;

  *)
    echo "usage: $0 {on|off|status}" >&2
    exit 2
    ;;
esac
