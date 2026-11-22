#!/usr/bin/env bash
# Usage: bash scripts/smoke-reports.sh   (API and web must be running)
set -euo pipefail
cd "$(dirname "$0")/.."
API=${API_URL:-http://localhost:4000}
WEB=${WEB_URL:-http://localhost:3000}
S=$(date +%s)
pass=0; fail=0
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
login() { curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$1\",\"password\":\"demo1234\"}" | json 'd.accessToken'; }
web_login() { curl -s -c "$1" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$2\",\"password\":\"demo1234\"}" >/dev/null; }
rq() { # token method path [body]
  if [ -n "${4:-}" ]; then curl -s -X "$2" "$API$3" -H "authorization: Bearer $1" -H 'content-type: application/json' -d "$4"
  else curl -s -X "$2" "$API$3" -H "authorization: Bearer $1"; fi
}
# Downloads a URL, then prints "<content-type>|<first 5 bytes>"
fetch_pdf() { local out; out=$(mktemp); local ct; ct=$(curl -s -o "$out" -w '%{content_type}' "$@"); echo "${ct%%;*}|$(head -c 5 "$out")"; rm -f "$out"; }

AT=$(login admin@demo.test); TT=$(login teacher@demo.test)
S1=$(login student1@demo.test); S2=$(login student2@demo.test)
SID=$(rq "$AT" GET "/students?q=DA-2026-001" | json 'd.items[0].id')
check "found the demo student" "$([ "$SID" != undefined ] && echo yes)" yes

echo "--- report card data ---"
RC=$(rq "$AT" GET "/students/$SID/report-card")
check "admin gets the student's report card data" "$(echo "$RC" | json 'd.rollNo')" DA-2026-001
check "it lists released exams" "$(echo "$RC" | json 'd.exams.length>=1')" true
check "it includes subject-wise totals" "$(echo "$RC" | json 'd.subjects.length>=1')" true
check "it includes attendance" "$(echo "$RC" | json '"percentage" in d.attendance')" true
check "ranks are within the number of attempts" "$(echo "$RC" | json 'd.exams.every(e=>e.rank===null||(e.rank>=1&&e.rank<=e.attempted))')" true
check "the demo teacher can see their own batch's student" "$(rq "$TT" GET "/students/$SID/report-card" | json 'd.rollNo')" DA-2026-001
check "a student can read their own card" "$(rq "$S1" GET /me/report-card | json 'd.rollNo')" DA-2026-001
check "a student cannot use the staff endpoint" "$(rq "$S1" GET "/students/$SID/report-card" | json 'd.error.code')" forbidden

LONE=$(rq "$AT" POST /students "{\"name\":\"No Batch $S\",\"email\":\"nobatch$S@demo.test\",\"rollNo\":\"NB-$S\"}" | json 'd.student.id')
check "a teacher can't open a student outside their batches" "$(rq "$TT" GET "/students/$LONE/report-card" | json 'd.error.code')" not_found
check "an admin can (a new student has an empty card)" "$(rq "$AT" GET "/students/$LONE/report-card" | json 'd.exams.length')" 0

echo "--- report card pdf ---"
check "the staff PDF is a real PDF" "$(fetch_pdf -H "authorization: Bearer $AT" "$API/students/$SID/report-card.pdf?remark=Well+done")" "application/pdf|%PDF-"
check "the student's own PDF is a real PDF" "$(fetch_pdf -H "authorization: Bearer $S1" "$API/me/report-card.pdf")" "application/pdf|%PDF-"
check "an empty report card still renders" "$(fetch_pdf -H "authorization: Bearer $AT" "$API/students/$LONE/report-card.pdf")" "application/pdf|%PDF-"

echo "--- results release ---"
BATCH=$(rq "$TT" GET /batches | json "d.find(b=>b.name==='NEET 2027 - Morning').id")
Q=$(rq "$TT" POST /questions "{\"subject\":\"Release\",\"body\":\"Release Q $S\",\"options\":[{\"id\":\"a\",\"text\":\"A\"},{\"id\":\"b\",\"text\":\"B\"}],\"correct\":[\"a\"]}" | json 'd.id')
EX=$(rq "$TT" POST /exams "{\"title\":\"Hidden Results $S\",\"batchId\":\"$BATCH\",\"durationMinutes\":10,\"releaseResults\":false,\"questionIds\":[\"$Q\"]}" | json 'd.id')
rq "$TT" POST "/exams/$EX/publish" >/dev/null
check "the exam was created with results hidden" "$(rq "$TT" GET "/exams/$EX" | json 'd.resultsReleased')" false
SESS=$(rq "$S1" POST "/exams/$EX/start" | json 'd.session.id')
NOW=$(node -pe 'Date.now()')
rq "$S1" POST "/exam-sessions/$SESS/answers" "{\"answers\":[{\"questionId\":\"$Q\",\"response\":\"a\",\"markedForReview\":false,\"clientSeq\":1,\"clientTs\":$NOW}]}" >/dev/null
SUB=$(rq "$S1" POST "/exam-sessions/$SESS/submit")
check "submit reports the results as not released" "$(echo "$SUB" | json 'd.released')" false
check "...and withholds the score" "$(echo "$SUB" | json 'd.total')" null
check "the student's exam list withholds the score" "$(rq "$S1" GET /me/exams | json "d.find(e=>e.id==='$EX').score")" null
check "staff still see the score" "$(rq "$TT" GET "/exams/$EX/results" | json 'd.results[0].score')" 4
check "the report card leaves the hidden exam out" "$(rq "$S1" GET /me/report-card | json "d.exams.some(e=>e.title==='Hidden Results $S')")" false
check "a student cannot release results" "$(rq "$S1" POST "/exams/$EX/release-results" | json 'd.error.code')" forbidden
check "staff release the results" "$(rq "$TT" POST "/exams/$EX/release-results" | json 'd.released')" true
check "the student now sees the score" "$(rq "$S1" GET /me/exams | json "d.find(e=>e.id==='$EX').score")" 4
check "the report card now includes the exam" "$(rq "$S1" GET /me/report-card | json "d.exams.some(e=>e.title==='Hidden Results $S')")" true
check "submitting again shows the released score" "$(rq "$S1" POST "/exam-sessions/$SESS/submit" | json 'd.total')" 4

echo "--- receipts ---"
RN=$(rq "$S1" GET /me/invoices | json 'd.flatMap(i=>i.payments).map(p=>p.receiptNo)[0]')
check "found a receipt belonging to the demo student" "$([ "$RN" != undefined ] && echo yes)" yes
check "the student downloads their own receipt" "$(fetch_pdf -H "authorization: Bearer $S1" "$API/me/receipts/$RN/pdf")" "application/pdf|%PDF-"
check "the admin downloads any receipt" "$(fetch_pdf -H "authorization: Bearer $AT" "$API/receipts/$RN/pdf")" "application/pdf|%PDF-"
check "another student cannot get it" "$(rq "$S2" GET "/me/receipts/$RN/pdf" | json 'd.error.code')" not_found
check "a malformed receipt number is rejected" "$(rq "$AT" GET "/receipts/nonsense/pdf" | json 'd.error.code')" validation_error

echo "--- web ---"
JS=$(mktemp); JT=$(mktemp); JA=$(mktemp)
web_login "$JS" student1@demo.test; web_login "$JT" teacher@demo.test; web_login "$JA" admin@demo.test
check "the student downloads a report card through the web app" "$(fetch_pdf -b "$JS" "$WEB/api/report-card")" "application/pdf|%PDF-"
check "staff download one with a remark" "$(fetch_pdf -b "$JT" "$WEB/api/report-card?studentId=$SID&remark=Keep+going")" "application/pdf|%PDF-"
check "staff must say which student" "$(code -b "$JT" "$WEB/api/report-card")" 400
check "anonymous report card requests are a JSON 401" "$(curl -s "$WEB/api/report-card" | json 'd.error.code')" unauthorized
check "the student downloads a receipt through the web app" "$(fetch_pdf -b "$JS" "$WEB/api/receipt/$RN")" "application/pdf|%PDF-"
check "the admin downloads a receipt through the web app" "$(fetch_pdf -b "$JA" "$WEB/api/receipt/$RN")" "application/pdf|%PDF-"
check "a malformed receipt number is a 404" "$(code -b "$JA" "$WEB/api/receipt/nonsense")" 404
check "the student page offers the report card" "$(curl -s -b "$JS" "$WEB/student" | grep -c 'report card' | awk '{print ($1>0)?"yes":"no"}')" yes
check "the fees page offers receipt PDFs" "$(curl -s -b "$JS" "$WEB/student/fees" | grep -c "api/receipt/$RN" | awk '{print ($1>0)?"yes":"no"}')" yes
rm -f "$JS" "$JT" "$JA"

check "audit chain is intact" "$(rq "$AT" GET /audit/verify | json 'd.ok')" true
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
