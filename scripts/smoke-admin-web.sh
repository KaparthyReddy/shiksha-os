#!/usr/bin/env bash
# Usage: bash scripts/smoke-admin-web.sh   (API and web must be running)
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
has() { local html; html=$(curl -s -b "$JA" "$WEB$1"); if grep -q -- "$2" <<<"$html"; then echo yes; else echo no; fi; }

JA=$(mktemp); JT=$(mktemp)
web_login "$JA" admin@demo.test
web_login "$JT" teacher@demo.test

AT=$(curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d '{"tenant":"demo-academy","email":"admin@demo.test","password":"demo1234"}' | json 'd.accessToken')
SID=$(curl -s "$API/students?q=DA-2026-001" -H "authorization: Bearer $AT" | json 'd.items[0].id')
BID=$(curl -s "$API/batches" -H "authorization: Bearer $AT" | json "d.find(b=>b.name==='NEET 2027 - Morning').id")
check "found the seeded student and batch ids" "$([ "$SID" != undefined ] && [ "$BID" != undefined ] && echo yes)" yes

check "anonymous users are sent to /login" "$(where "$WEB/admin/students")" /login
check "teachers are kept out of admin pages" "$(where -b "$JT" "$WEB/admin/students")" /teacher

check "students page lists seeded students" "$(has /admin/students DA-2026-001)" yes
check "search finds a matching student" "$(has '/admin/students?q=DA-2026-003' DA-2026-003)" yes
check "search leaves out non-matching students" "$(has '/admin/students?q=DA-2026-003' DA-2026-001)" no
check "an empty search still renders" "$(code -b "$JA" "$WEB/admin/students?q=zzzz-nothing")" 200
check "the add-student form is on the page" "$(has /admin/students 'Create student')" yes

check "student detail shows the roll number" "$(has "/admin/students/$SID" DA-2026-001)" yes
check "student detail lists the batch" "$(has "/admin/students/$SID" 'NEET 2027 - Morning')" yes
check "an unknown student id is a 404" "$(code -b "$JA" "$WEB/admin/students/00000000-0000-4000-8000-000000000000")" 404
check "a malformed student id is a 404" "$(code -b "$JA" "$WEB/admin/students/not-an-id")" 404

check "faculty page lists the demo teacher" "$(has /admin/faculty 'Demo Teacher')" yes
check "batches page lists the seeded batch" "$(has /admin/batches 'NEET 2027 - Morning')" yes
check "batch detail shows the roster" "$(has "/admin/batches/$BID" 'Student 1')" yes
check "an unknown batch id is a 404" "$(code -b "$JA" "$WEB/admin/batches/00000000-0000-4000-8000-000000000000")" 404

rm -f "$JA" "$JT"
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
