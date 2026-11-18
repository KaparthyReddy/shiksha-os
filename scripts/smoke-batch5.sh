#!/usr/bin/env bash
# Smoke test for exams, attendance and fees. Usage: bash scripts/smoke-batch5.sh
set -euo pipefail

API=${API_URL:-http://localhost:4000}
S=$(date +%s)
pass=0; fail=0

json() { node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1"; }
req() { # method path token [body]
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

ADMIN=$(login demo-academy admin@demo.test)
TEACHER=$(login demo-academy teacher@demo.test)
STUDENT=$(login demo-academy student1@demo.test)
OTHER=$(login other-academy admin@other.test)
BATCH=$(req GET /batches "$ADMIN" | json "d.find(b=>b.name==='NEET 2027 - Morning').id")

echo "--- exams ---"
mkq() {
  req POST /questions "$TEACHER" "{\"subject\":\"Smoke\",\"body\":\"$1 $S\",\"options\":[{\"id\":\"a\",\"text\":\"A\"},{\"id\":\"b\",\"text\":\"B\"},{\"id\":\"c\",\"text\":\"C\"},{\"id\":\"d\",\"text\":\"D\"}],\"correct\":[\"$2\"]}" | json 'd.id'
}
Q1=$(mkq Q1 a); Q2=$(mkq Q2 b); Q3=$(mkq Q3 c)
check "teacher creates 3 questions" "$([ "$Q1" != undefined ] && [ "$Q2" != undefined ] && [ "$Q3" != undefined ] && echo yes)" yes
check "question with a bad correct option is rejected" \
  "$(req POST /questions "$TEACHER" '{"subject":"x","body":"x","options":[{"id":"a","text":"A"},{"id":"b","text":"B"}],"correct":["z"]}' | json 'd.error.code')" validation_error
check "exam with an unknown question is rejected" \
  "$(req POST /exams "$TEACHER" "{\"title\":\"Bad\",\"durationMinutes\":10,\"questionIds\":[\"00000000-0000-4000-8000-000000000000\"]}" | json 'd.error.code')" bad_request

EXAM=$(req POST /exams "$TEACHER" "{\"title\":\"Smoke Exam $S\",\"batchId\":\"$BATCH\",\"durationMinutes\":30,\"questionIds\":[\"$Q1\",\"$Q2\",\"$Q3\"]}" | json 'd.id')
check "student cannot start a draft exam" "$(req POST "/exams/$EXAM/start" "$STUDENT" | json 'd.error.code')" not_found
check "teacher publishes the exam" "$(req POST "/exams/$EXAM/publish" "$TEACHER" | json 'd.status')" published

START=$(req POST "/exams/$EXAM/start" "$STUDENT")
SESSION=$(echo "$START" | json 'd.session.id')
check "student starts the exam" "$([ "$SESSION" != undefined ] && echo yes)" yes
check "payload never contains correct answers" "$(echo "$START" | json 'JSON.stringify(d).includes("\"correct\"")')" false
check "all 3 questions delivered" "$(echo "$START" | json 'd.questions.length')" 3
check "starting again resumes the same session" "$(req POST "/exams/$EXAM/start" "$STUDENT" | json "d.session.id==='$SESSION'")" true
check "teacher cannot use the student endpoint" "$(req POST "/exams/$EXAM/start" "$TEACHER" | json 'd.error.code')" forbidden

NOW=$(node -pe 'Date.now()')
sync() { req POST "/exam-sessions/$SESSION/answers" "$STUDENT" "{\"answers\":[$1]}"; }
A1="{\"questionId\":\"$Q1\",\"response\":\"a\",\"markedForReview\":false,\"clientSeq\":1,\"clientTs\":$NOW}"
A2="{\"questionId\":\"$Q2\",\"response\":\"d\",\"markedForReview\":false,\"clientSeq\":1,\"clientTs\":$NOW}"
A2B="{\"questionId\":\"$Q2\",\"response\":\"b\",\"markedForReview\":false,\"clientSeq\":2,\"clientTs\":$NOW}"
check "first sync accepts both answers" "$(sync "$A1,$A2" | json 'd.accepted')" 2
check "replaying the same sync is harmless (stale seq)" "$(sync "$A1,$A2" | json 'd.rejected.map(r=>r.reason).join()')" stale_seq,stale_seq
check "a newer seq overwrites the old answer" "$(sync "$A2B" | json 'd.accepted')" 1

SUB=$(req POST "/exam-sessions/$SESSION/submit" "$STUDENT")
check "submit scores 8 (two correct, one unanswered)" "$(echo "$SUB" | json 'd.total')" 8
check "max score is 12" "$(echo "$SUB" | json 'd.maxScore')" 12
check "submitting twice returns the same score" "$(req POST "/exam-sessions/$SESSION/submit" "$STUDENT" | json 'd.total')" 8
check "sync after submit is rejected" "$(sync "$A1" | json 'd.rejected[0].reason')" session_closed
check "cannot start again after submitting" "$(req POST "/exams/$EXAM/start" "$STUDENT" | json 'd.error.code')" conflict
check "staff results show the score" "$(req GET "/exams/$EXAM/results" "$TEACHER" | json 'd.results[0].score')" 8
check "student cannot read results" "$(req GET "/exams/$EXAM/results" "$STUDENT" | json 'd.error.code')" forbidden
check "other tenant cannot see our exam" "$(req GET "/exams/$EXAM" "$OTHER" | json 'd.error.code')" not_found

echo "--- attendance ---"
TODAY=$(date +%F)
IDS=$(req GET "/students?batchId=$BATCH" "$ADMIN" | json 'd.items.slice(0,2).map(s=>s.id).join(" ")')
set -- $IDS; SA=$1; SB=$2
mark() { req PUT /attendance "$TEACHER" "{\"batchId\":\"$BATCH\",\"date\":\"$TODAY\",\"records\":[{\"studentId\":\"$SA\",\"status\":\"present\"},{\"studentId\":\"$SB\",\"status\":\"$1\"}]}"; }
check "teacher marks attendance" "$(mark absent | json 'd.saved')" 2
check "re-marking updates instead of duplicating" "$(mark late | json 'd.saved')" 2
check "roster shows the updated status" "$(req GET "/attendance?batchId=$BATCH&date=$TODAY" "$TEACHER" | json "d.find(r=>r.studentId==='$SB').status")" late
check "future dates are rejected" "$(req PUT /attendance "$TEACHER" "{\"batchId\":\"$BATCH\",\"date\":\"2099-01-01\",\"records\":[{\"studentId\":\"$SA\",\"status\":\"present\"}]}" | json 'd.error.code')" bad_request
check "students outside the batch are rejected" "$(req PUT /attendance "$TEACHER" "{\"batchId\":\"$BATCH\",\"date\":\"$TODAY\",\"records\":[{\"studentId\":\"00000000-0000-4000-8000-000000000000\",\"status\":\"present\"}]}" | json 'd.error.code')" bad_request
check "other tenant cannot read our roster" "$(req GET "/attendance?batchId=$BATCH&date=$TODAY" "$OTHER" | json 'd.error.code')" not_found
check "students cannot mark attendance" "$(mark present >/dev/null; req PUT /attendance "$STUDENT" '{}' | json 'd.error.code')" forbidden
check "summary has a percentage for each student" "$(req GET "/attendance/summary?batchId=$BATCH" "$TEACHER" | json 'd.every(r=>"percentage" in r)')" true

echo "--- fees ---"
PLAN=$(req POST /fee-plans "$ADMIN" "{\"name\":\"Smoke Plan $S\",\"amountPaise\":1000000}" | json 'd.id')
ENROLLED=$(req GET "/batches/$BATCH" "$ADMIN" | json 'd.enrolled')
check "bulk invoicing covers every enrolled student" "$(req POST /invoices/bulk "$ADMIN" "{\"batchId\":\"$BATCH\",\"feePlanId\":\"$PLAN\"}" | json 'd.created')" "$ENROLLED"
check "bulk invoicing twice creates nothing new" "$(req POST /invoices/bulk "$ADMIN" "{\"batchId\":\"$BATCH\",\"feePlanId\":\"$PLAN\"}" | json 'd.created')" 0

INV=$(req GET "/invoices?studentId=$SA" "$ADMIN" | json "d.items.find(i=>i.feePlanId==='$PLAN').id")
pay() { req POST "/invoices/$INV/payments" "$ADMIN" "{\"amountPaise\":$1,\"method\":\"cash\"}"; }
P1=$(pay 400000)
check "partial payment marks the invoice partial" "$(echo "$P1" | json 'd.status')" partial
check "a receipt number is issued" "$(echo "$P1" | json 'd.payment.receiptNo.startsWith("RCP-")')" true
check "overpaying is blocked" "$(pay 700000 | json 'd.error.code')" conflict
check "paying the exact balance completes it" "$(pay 600000 | json 'd.status')" paid
check "a paid invoice cannot be voided" "$(req POST "/invoices/$INV/void" "$ADMIN" | json 'd.error.code')" conflict
check "teachers cannot see invoices" "$(req GET /invoices "$TEACHER" | json 'd.error.code')" forbidden
check "student sees their own invoices" "$(req GET /me/invoices "$STUDENT" | json 'd.length>=1')" true
check "fee summary reflects collections" "$(req GET /fees/summary "$ADMIN" | json 'd.collectedPaise>=1000000')" true

check "audit chain is intact" "$(req GET /audit/verify "$ADMIN" | json 'd.ok')" true

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
