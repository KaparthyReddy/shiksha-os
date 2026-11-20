#!/usr/bin/env bash
# Usage: bash scripts/smoke-fees-web.sh   (API and web must be running)
set -euo pipefail
WEB=${WEB_URL:-http://localhost:3000}
API=${API_URL:-http://localhost:4000}
pass=0; fail=0
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
where() { curl -s -o /dev/null -w "%{redirect_url}" "$@" | sed "s|^$WEB||"; }
web_login() { curl -s -c "$1" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$2\",\"password\":\"demo1234\"}" >/dev/null; }
# Captures the page first: piping curl into `grep -q` can trip pipefail when grep exits early.
has() { local html; html=$(curl -s -b "$1" "$WEB$2"); if grep -q -- "$3" <<<"$html"; then echo yes; else echo no; fi; }

JA=$(mktemp); JT=$(mktemp); JS=$(mktemp)
web_login "$JA" admin@demo.test
web_login "$JT" teacher@demo.test
web_login "$JS" student1@demo.test

AT=$(curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d '{"tenant":"demo-academy","email":"admin@demo.test","password":"demo1234"}' | json 'd.accessToken')
auth=(-H "authorization: Bearer $AT")
BID=$(curl -s "$API/batches" "${auth[@]}" | json "d.find(b=>b.name==='NEET 2027 - Morning').id")
PAID=$(curl -s "$API/invoices?status=paid&pageSize=1" "${auth[@]}" | json 'd.items[0].id')
TODAY=$(date +%F)
check "found a batch and a paid invoice to look at" "$([ "$BID" != undefined ] && [ "$PAID" != undefined ] && echo yes)" yes

echo "--- fees (admin) ---"
check "fees page shows the totals" "$(has "$JA" /admin/fees Collected)" yes
check "fees page has the bulk-invoice form" "$(has "$JA" /admin/fees 'Create invoices')" yes
check "the status filter works" "$(has "$JA" '/admin/fees?status=paid' paid)" yes
check "a search with no matches still renders" "$(code -b "$JA" "$WEB/admin/fees?q=zzzz-nothing")" 200
check "invoice detail shows its receipts" "$(has "$JA" "/admin/fees/$PAID" 'RCP-')" yes
check "an unknown invoice id is a 404" "$(code -b "$JA" "$WEB/admin/fees/00000000-0000-4000-8000-000000000000")" 404
check "a malformed invoice id is a 404" "$(code -b "$JA" "$WEB/admin/fees/not-an-id")" 404
check "teachers are kept out of fees" "$(where -b "$JT" "$WEB/admin/fees")" /teacher
check "students are kept out of fees" "$(where -b "$JS" "$WEB/admin/fees")" /student

echo "--- attendance ---"
check "register asks for a batch first" "$(has "$JA" /admin/attendance 'Choose a batch')" yes
check "admin register lists the roster" "$(has "$JA" "/admin/attendance?batchId=$BID&date=$TODAY" DA-2026-001)" yes
check "the register has the quick-mark button" "$(has "$JA" "/admin/attendance?batchId=$BID&date=$TODAY" 'Mark all present')" yes
check "teacher register lists the roster" "$(has "$JT" "/teacher/attendance?batchId=$BID&date=$TODAY" DA-2026-001)" yes
check "a made-up batch id falls back to the picker" "$(has "$JT" '/teacher/attendance?batchId=00000000-0000-4000-8000-000000000000' 'Choose a batch')" yes
check "students are kept out of the register" "$(where -b "$JS" "$WEB/teacher/attendance")" /student

echo "--- student pages ---"
check "student attendance page renders" "$(has "$JS" /student/attendance 'My attendance')" yes
check "student fees page renders" "$(has "$JS" /student/fees 'Your invoices')" yes
check "teachers are kept out of student pages" "$(where -b "$JT" "$WEB/student/fees")" /teacher

rm -f "$JA" "$JT" "$JS"
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
