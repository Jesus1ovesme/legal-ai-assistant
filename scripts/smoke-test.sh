#!/usr/bin/env bash
# E2E smoke test: проходит критические user-paths и валидирует ответы.
# Использует креды из .env. Безопасен к повторам, ничего не пишет в БД
# (кроме строки в audit_log от LOGIN_OK — это ожидаемо).
#
# Запуск:    bash scripts/smoke-test.sh
# Exit 0    — все шаги OK
# Exit 1    — любой шаг упал
set -euo pipefail

ROOT=.
WEB=http://127.0.0.1:3010
TERM=http://127.0.0.1:3011
COOKIE=/tmp/smoke.jar

step() { echo; echo "── $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. Health endpoints (no auth)
step "health (web + term)"
curl -fsS "$WEB/api/health" | grep -q '"ok":true' || fail "/api/health"
curl -fsS "$TERM/health"     | grep -q '"ok":true' || fail "term /health"

# 2. CSRF + login
step "auth"
KEY=$(grep -E "^APP_ACCESS_KEY=" "$ROOT/.env" | cut -d= -f2- | sed 's/^"//; s/"$//')
[ -n "$KEY" ] || fail "APP_ACCESS_KEY не задан в .env"

CSRF=$(curl -fsSc "$COOKIE" "$WEB/api/auth/csrf" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$CSRF" ] || fail "csrf token пустой"

LOGIN=$(curl -fsSb "$COOKIE" -c "$COOKIE" -X POST "$WEB/api/auth/login" \
  -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
  -d "{\"key\":\"$KEY\"}")
echo "$LOGIN" | grep -q '"ok":true' || fail "login: $LOGIN"

# 3. Authenticated GET endpoints
step "authed GETs"
for path in /api/usage /api/usage/today /api/folders /api/case-types /api/audit /api/health/full; do
  code=$(curl -sb "$COOKIE" -o /dev/null -w "%{http_code}" "$WEB$path")
  [ "$code" = "200" ] || fail "$path → HTTP $code"
  echo "  $path  ✓ 200"
done

# 4. CSRF guard (logout без токена → 403)
step "csrf guard"
code=$(curl -sb "$COOKIE" -X POST -o /dev/null -w "%{http_code}" "$WEB/api/auth/logout")
[ "$code" = "403" ] || fail "logout без csrf должен 403, получили $code"
echo "  logout без csrf  ✓ 403"

# 5. Folder ownership (term-server должен 403 на чужой ULID)
step "term-server ownership check"
COOKIE_VAL=$(awk '/danilurist_session/{print $7}' "$COOKIE")
WSTEST=./apps/term-server/wstest-smoke.mjs
cat >"$WSTEST" <<'EOF'
import WebSocket from "ws";
const ws=new WebSocket(`ws://127.0.0.1:3011/ws/term?folderId=${process.env.FID}`,{headers:{Cookie:`danilurist_session=${process.env.COOKIE}`}});
let httpCode=null;
ws.on("unexpected-response",(req,res)=>{httpCode=res.statusCode; ws.terminate();});
ws.on("open",()=>{httpCode=200; ws.close();});
ws.on("close",()=>{console.log("HTTP="+(httpCode??"unknown")); process.exit(0);});
ws.on("error",()=>{});
setTimeout(()=>{console.log("HTTP=timeout"); process.exit(0);},3000);
EOF
RANDOM_ULID="01ZZZZZZZZZZZZZZZZZZZZZZZZ"
RES=$(cd ./apps/term-server && FID="$RANDOM_ULID" COOKIE="$COOKIE_VAL" node wstest-smoke.mjs)
echo "  random ULID: $RES"
echo "$RES" | grep -q "HTTP=403" || fail "ownership-check не сработал: $RES"

OWN_FID=$(curl -sb "$COOKIE" "$WEB/api/folders" | python3 -c "import sys,json; f=json.load(sys.stdin)['folders']; print(f[0]['id'] if f else '')")
if [ -n "$OWN_FID" ]; then
  RES=$(cd ./apps/term-server && FID="$OWN_FID" COOKIE="$COOKIE_VAL" node wstest-smoke.mjs)
  echo "  own folder ($OWN_FID): $RES"
  echo "$RES" | grep -q "HTTP=200" || fail "own folder не открылась: $RES"
fi
rm -f "$WSTEST"

# 6. Security headers
step "security headers"
HEADERS=$(curl -sI "$WEB/api/health")
for hdr in "X-Content-Type-Options" "X-Frame-Options" "Referrer-Policy" "Permissions-Policy" "Strict-Transport-Security"; do
  echo "$HEADERS" | grep -qi "^$hdr:" || fail "missing header: $hdr"
  echo "  $hdr  ✓"
done

# 7. Negative paths — поведение при битых вводах
step "negative paths"

# Folder list-create без CSRF — должно 403
NO_CSRF_CODE=$(curl -sb "$COOKIE" -X POST -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d '{"action":"create","name":"x","caseType":"GENERAL"}' \
  "$WEB/api/folders")
[ "$NO_CSRF_CODE" = "403" ] || fail "POST /api/folders без CSRF: ожидали 403, получили $NO_CSRF_CODE"
echo "  POST /api/folders без csrf  ✓ 403"

# Невалидный folderId на term-server
TERM_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  "$TERM/ws/term?folderId=invalid")
[ "$TERM_CODE" = "400" ] || fail "term-server invalid folderId: ожидали 400, получили $TERM_CODE"
echo "  term WS invalid folderId  ✓ 400"

# /api/files без folderId — должно 400
F_CODE=$(curl -sb "$COOKIE" -o /dev/null -w "%{http_code}" "$WEB/api/files")
[ "$F_CODE" = "400" ] || fail "/api/files без folderId: ожидали 400, получили $F_CODE"
echo "  /api/files без folderId  ✓ 400"

# Несуществующий folder/[id]/preview — должно 404 (через несуществующий ULID)
P_CODE=$(curl -sb "$COOKIE" -o /dev/null -w "%{http_code}" \
  "$WEB/api/files/01ZZZZZZZZZZZZZZZZZZZZZZZZ/preview")
[ "$P_CODE" = "404" ] || fail "/api/files/[fake]/preview: ожидали 404, получили $P_CODE"
echo "  /api/files/[fake]/preview  ✓ 404"

echo
echo "✓ ALL SMOKE TESTS PASSED"
