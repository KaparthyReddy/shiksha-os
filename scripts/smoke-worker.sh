#!/usr/bin/env bash
# Needs the API and the worker both running (pnpm dev). Usage: bash scripts/smoke-worker.sh
set -euo pipefail
cd "$(dirname "$0")/.."

API=${API_URL:-http://localhost:4000}
MAILPIT=${MAILPIT_URL:-http://localhost:8025}
S=$(date +%s)
pass=0; fail=0

json() { node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1"; }
req() {
  local m=$1 p=$2 t=$3 b=${4:-}
  if [ -n "$b" ]; then
    curl -s -X "$m" "$API$p" -H "authorization: Bearer $t" -H 'content-type: application/json' -d "$b"
  else
    curl -s -X "$m" "$API$p" -H "authorization: Bearer $t"
  fi
}
login() {
  curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
    -d "{\"tenant\":\"$1\",\"email\":\"$2\",\"password\":\"${3:-demo1234}\"}" | json 'd.accessToken'
}
check() {
  if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi
}
sql() { docker compose -f infra/docker-compose.yml exec -T postgres psql -U shiksha -d shiksha -tAc "$1" | tr -d ' \r\n'; }
mail_has() { curl -s "$MAILPIT/api/v1/messages?limit=200" | json "d.messages.some(m=>m.Subject.includes('$1'))"; }
wait_for() { # seconds, then a shell condition that prints "true" when satisfied
  local end=$((SECONDS + $1)) cond=$2
  while [ "$SECONDS" -lt "$end" ]; do
    if [ "$(eval "$cond" 2>/dev/null || true)" = "true" ]; then echo true; return; fi
    sleep 3
  done
  echo false
}

curl -sf "$MAILPIT/api/v1/info" >/dev/null || { echo "Mailpit not reachable at $MAILPIT (is pnpm infra:up running?)"; exit 1; }

ADMIN=$(login demo-academy admin@demo.test)
TEACHER=$(login demo-academy teacher@demo.test)
STUDENT=$(login demo-academy student1@demo.test)

echo "--- receipt emails ---"
SID=$(req GET "/students?q=DA-2026-001" "$ADMIN" | json 'd.items[0].id')
INV=$(req POST /invoices "$ADMIN" "{\"studentId\":\"$SID\",\"amountPaise\":50000}" | json 'd.id')
RCP=$(req POST "/invoices/$INV/payments" "$ADMIN" '{"amountPaise":20000,"method":"upi","reference":"worker-smoke"}' | json 'd.payment.receiptNo')
check "payment recorded with a receipt number" "$([ "$RCP" != undefined ] && echo yes)" yes
check "receipt email arrives in Mailpit within 45s" "$(wait_for 45 "mail_has $RCP")" true
MID=$(curl -s "$MAILPIT/api/v1/messages?limit=200" | json "(d.messages.find(m=>m.Subject.includes('$RCP'))||{}).ID")
ATT=$(curl -s "$MAILPIT/api/v1/message/$MID" | json "(d.Attachments||[]).map(a=>a.ContentType+' '+a.FileName).join()")
check "email carries the PDF receipt" "$ATT" "application/pdf ${RCP}.pdf"
check "payment is marked as emailed" "$(sql "select receipt_emailed_at is not null from payments where receipt_no='$RCP'")" t

echo "--- exam sweep ---"
BATCH=$(req GET /batches "$ADMIN" | json "d.find(b=>b.name==='NEET 2027 - Morning').id")
Q=$(req POST /questions "$TEACHER" "{\"subject\":\"Smoke\",\"body\":\"Sweep Q $S\",\"options\":[{\"id\":\"a\",\"text\":\"A\"},{\"id\":\"b\",\"text\":\"B\"}],\"correct\":[\"a\"]}" | json 'd.id')
EXAM=$(req POST /exams "$TEACHER" "{\"title\":\"Sweep Exam $S\",\"batchId\":\"$BATCH\",\"durationMinutes\":30,\"questionIds\":[\"$Q\"]}" | json 'd.id')
req POST "/exams/$EXAM/publish" "$TEACHER" >/dev/null
SESSION=$(req POST "/exams/$EXAM/start" "$STUDENT" | json 'd.session.id')
NOW=$(node -pe 'Date.now()')
check "student answers before the deadline" "$(req POST "/exam-sessions/$SESSION/answers" "$STUDENT" "{\"answers\":[{\"questionId\":\"$Q\",\"response\":\"a\",\"markedForReview\":false,\"clientSeq\":1,\"clientTs\":$NOW}]}" | json 'd.accepted')" 1

# Simulate the student walking away: push the deadline far past the 5-minute resume window.
sql "update exam_sessions set started_at = now() - interval '40 minutes', deadline_at = now() - interval '10 minutes' where id='$SESSION'" >/dev/null
check "worker expires the abandoned session within 100s" "$(wait_for 100 "[ \"\$(sql \"select status from exam_sessions where id='$SESSION'\")\" = expired ] && echo true")" true
check "the expired session was graded (4 marks for the correct answer)" "$(req GET "/exams/$EXAM/results" "$TEACHER" | json 'd.results[0].score')" 4

echo "--- audit anchor ---"
pnpm --filter @shiksha/worker run once audit-anchor >/dev/null 2>&1 || true
check "an audit anchor exists" "$(sql "select count(*) > 0 from audit_anchors")" t
check "the newest anchor says the chain is intact" "$(sql "select ok from audit_anchors order by id desc limit 1")" t
check "audit chain verifies through the API" "$(req GET /audit/verify "$ADMIN" | json 'd.ok')" true

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
