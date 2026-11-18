#!/usr/bin/env bash
# Usage: bash scripts/smoke-auth.sh   (API must be running)
set -euo pipefail
API=${API_URL:-http://localhost:4000}
pass=0; fail=0
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi; }
refresh() { curl -s -X POST "$API/auth/refresh" -H 'content-type: application/json' -d "{\"refreshToken\":\"$1\"}"; }

L=$(curl -s -X POST "$API/auth/login" -H 'content-type: application/json' -d '{"tenant":"demo-academy","email":"student1@demo.test","password":"demo1234"}')
RT1=$(echo "$L" | json 'd.refreshToken')
check "login returns an access and a refresh token" "$(echo "$L" | json 'Boolean(d.accessToken && d.refreshToken)')" true

R2=$(refresh "$RT1"); RT2=$(echo "$R2" | json 'd.refreshToken'); AT2=$(echo "$R2" | json 'd.accessToken')
check "refresh rotates to a new refresh token" "$([ "$RT2" != "$RT1" ] && [ "$RT2" != undefined ] && echo yes)" yes
check "the new access token works" "$(curl -s "$API/auth/me" -H "authorization: Bearer $AT2" | json 'd.role')" student

R3=$(refresh "$RT1"); RT3=$(echo "$R3" | json 'd.refreshToken')
check "reusing a token inside the grace window still works (two tabs)" "$([ "$RT3" != undefined ] && echo yes)" yes

echo "  (waiting 11s for the grace window to close)"; sleep 11
check "reusing a rotated token later is rejected" "$(refresh "$RT1" | json 'd.error.code')" unauthorized
check "reuse revoked the whole family (newest token dead)" "$(refresh "$RT2" | json 'd.error.code')" unauthorized
check "...including the grace-window child" "$(refresh "$RT3" | json 'd.error.code')" unauthorized

L2=$(curl -s -X POST "$API/auth/login" -H 'content-type: application/json' -d '{"tenant":"demo-academy","email":"student1@demo.test","password":"demo1234"}')
RT4=$(echo "$L2" | json 'd.refreshToken')
curl -s -X POST "$API/auth/logout" -H 'content-type: application/json' -d "{\"refreshToken\":\"$RT4\"}" >/dev/null
check "logout kills the refresh token" "$(refresh "$RT4" | json 'd.error.code')" unauthorized
check "garbage tokens are rejected" "$(refresh "not-a-real-token-at-all-nope" | json 'd.error.code')" unauthorized

echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
