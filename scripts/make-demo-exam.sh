#!/usr/bin/env bash
# Usage: bash scripts/make-demo-exam.sh   (API must be running)
set -euo pipefail
API=${API_URL:-http://localhost:4000}
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }

T=$(curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d '{"tenant":"demo-academy","email":"teacher@demo.test","password":"demo1234"}' | json 'd.accessToken')
auth=(-H "authorization: Bearer $T")

BATCH=$(curl -s "$API/batches" "${auth[@]}" | json "d.find(b=>b.name==='NEET 2027 - Morning').id")
IDS=$(curl -s "$API/questions?pageSize=8" "${auth[@]}" | json 'JSON.stringify(d.items.slice(0,8).map(q=>q.id))')
TITLE="Offline Drill $(date +%H:%M)"

EXAM=$(curl -s -X POST "$API/exams" "${auth[@]}" -H 'content-type: application/json' \
  -d "{\"title\":\"$TITLE\",\"batchId\":\"$BATCH\",\"durationMinutes\":3,\"questionIds\":$IDS}" | json 'd.id')
[ "$EXAM" != "undefined" ] && [ "$EXAM" != "PARSE-ERROR" ] || { echo "Could not create the exam"; exit 1; }
curl -s -X POST "$API/exams/$EXAM/publish" "${auth[@]}" >/dev/null

echo "Created and published: $TITLE ($(echo "$IDS" | json 'd.length') questions, 3 minutes)"
echo "Open http://localhost:3000, sign in as student1@demo.test / demo1234 and start it."
