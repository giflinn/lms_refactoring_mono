#!/usr/bin/env bash
# Print the --dart-define=API_URL=... line for the Mac's current Wi-Fi IP so
# a physical iOS/Android device on the same network can reach the backend.
# Paste it into Xcode → Edit Scheme → Run → Arguments → "Arguments Passed On
# Launch", or use the printed `flutter run` command directly.

set -euo pipefail

PORT="${PORT:-3000}"

IP=""
INTERFACE=""
for IF in en0 en1 en2 en3; do
  candidate="$(ipconfig getifaddr "$IF" 2>/dev/null || true)"
  if [[ -n "$candidate" ]]; then
    IP="$candidate"
    INTERFACE="$IF"
    break
  fi
done

if [[ -z "$IP" ]]; then
  echo "✗ Не нашёл активного интерфейса (en0–en3). Подключись к Wi-Fi." >&2
  exit 1
fi

URL="http://${IP}:${PORT}"
DART_DEFINE="--dart-define=API_URL=${URL}"

echo
echo "Интерфейс : ${INTERFACE}"
echo "IP        : ${IP}"
echo "API URL   : ${URL}"
echo

echo "Проверяю бэкенд…"
if curl -sf --max-time 2 "${URL}/api/health" >/dev/null; then
  echo "  ✓ ${URL}/api/health отвечает"
else
  echo "  ✗ ${URL}/api/health НЕ отвечает"
  echo "    — бэкенд запущен? (pm2 status / pm2 start lms-backend)"
  echo "    — macOS Firewall не блокирует входящие на ${PORT}?"
fi

echo
echo "Для Xcode → Edit Scheme → Run → Arguments → Arguments Passed On Launch:"
echo
echo "    ${DART_DEFINE}"
echo
echo "Или из терминала:"
echo
echo "    flutter run ${DART_DEFINE}"
echo

if command -v pbcopy >/dev/null 2>&1; then
  printf "%s" "${DART_DEFINE}" | pbcopy
  echo "(скопировано в буфер обмена — ⌘V)"
fi

echo
echo "Если телефон всё равно не видит бэкенд:"
echo "  • публичный Wi-Fi часто включает AP-isolation между клиентами —"
echo "    раздай интернет с телефона на Mac (Personal Hotspot) или наоборот;"
echo "  • Mac и телефон должны быть в одной сети (одинаковый /24);"
echo "  • System Settings → Network → Firewall: разреши входящие для node."
