#!/usr/bin/env bash
# Usage: bash scripts/smoke-staff-web.sh   (API and web must be running)
set -euo pipefail
WEB=${WEB_URL:-http://localhost:3000}
API=${API_URL:-http://localhost:4000}
S=$(date +%s)
pass=0; fail=0
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
where() { curl -s -o /dev/null -w "%{redirect_url}" "$@" | sed "s|^$WEB||"; }
web_login() { curl -s -c "$1" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$2\",\"password\":\"demo1234\"}" >/dev/null; }
api_login() { curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$1\",\"password\":\"demo1234\"}" | json 'd.accessToken'; }
# Captures the page first: piping curl into `grep -q` can trip pipefail when grep exits early.
has() { local html; html=$(curl -s -b "$1" "$WEB$2"); if grep -q -- "$3" <<<"$html"; then echo yes; else echo no; fi; }
treq() { if [ -n "${3:-}" ]; then curl -s -X "$1" "$API$2" -H "authorization: Bearer $TT" -H 'content-type: application/json' -d "$3"
  else curl -s -X "$1" "$API$2" -H "authorization: Bearer $TT"; fi; }
sreq() { if [ -n "${3:-}" ]; then curl -s -X "$1" "$API$2" -H "authorization: Bearer $ST" -H 'content-type: application/json' -d "$3"
  else curl -s -X "$1" "$API$2" -H "authorization: Bearer $ST"; fi; }

JA=$(mktemp); JT=$(mktemp); JS=$(mktemp)
web_login "$JA" admin@demo.test
web_login "$JT" teacher@demo.test
web_login "$JS" student1@demo.test
TT=$(api_login teacher@demo.test)
ST=$(api_login student1@demo.test)

echo "--- test data ---"
BATCH=$(treq GET /batches | json "d.find(b=>b.name==='NEET 2027 - Morning').id")
mkq() { treq POST /questions "{\"subject\":\"StaffSmoke\",\"body\":\"Smoke $1 $S\",\"options\":[{\"id\":\"a\",\"text\":\"A\"},{\"id\":\"b\",\"text\":\"B\"}],\"correct\":[\"a\"]}" | json 'd.id'; }
Q1=$(mkq Q1); Q2=$(mkq Q2)
EXAM=$(treq POST /exams "{\"title\":\"Staff Smoke $S\",\"batchId\":\"$BATCH\",\"durationMinutes\":20,\"questionIds\":[\"$Q1\",\"$Q2\"]}" | json 'd.id')
treq POST "/exams/$EXAM/publish" >/dev/null
SESSION=$(sreq POST "/exams/$EXAM/start" | json 'd.session.id')
NOW=$(node -pe 'Date.now()')
sreq POST "/exam-sessions/$SESSION/answers" "{\"answers\":[{\"questionId\":\"$Q1\",\"response\":\"a\",\"markedForReview\":false,\"clientSeq\":1,\"clientTs\":$NOW}]}" >/dev/null
SUB=$(sreq POST "/exam-sessions/$SESSION/submit" | json 'd.total')
check "a submitted attempt exists (4 marks)" "$SUB" 4

echo "--- access ---"
check "anonymous users are sent to /login" "$(where "$WEB/staff/questions")" /login
check "students are kept out of staff pages" "$(where -b "$JS" "$WEB/staff/exams")" /student
check "students get 403 from the question search" "$(curl -s -b "$JS" "$WEB/api/staff/questions" | json 'd.error.code')" forbidden
check "anonymous question search is a JSON 401" "$(curl -s "$WEB/api/staff/questions" | json 'd.error.code')" unauthorized
check "anonymous CSV download is a JSON 401" "$(curl -s "$WEB/api/staff/exams/$EXAM/results/csv" | json 'd.error.code')" unauthorized

echo "--- question bank ---"
check "teacher sees the question bank" "$(has "$JT" /staff/questions 'Question bank')" yes
check "admin sees the question bank" "$(has "$JA" /staff/questions 'Question bank')" yes
check "search finds the smoke question" "$(has "$JT" "/staff/questions?q=Smoke+Q1+$S" "Smoke Q1 $S")" yes
check "search leaves out other questions" "$(has "$JT" "/staff/questions?q=Smoke+Q1+$S" "Smoke Q2 $S")" no
check "the new-question form renders" "$(has "$JT" /staff/questions/new 'Question type')" yes
check "the edit form is prefilled" "$(has "$JT" "/staff/questions/$Q1" "Smoke Q1 $S")" yes
check "an unknown question is a 404" "$(code -b "$JT" "$WEB/staff/questions/00000000-0000-4000-8000-000000000000")" 404
check "a malformed question id is a 404" "$(code -b "$JT" "$WEB/staff/questions/not-an-id")" 404
check "the search proxy returns matches" "$(curl -s -b "$JT" "$WEB/api/staff/questions?q=Smoke+Q1+$S" | json 'd.items.length')" 1

echo "--- exams ---"
check "exam list shows the exam" "$(has "$JT" /staff/exams "Staff Smoke $S")" yes
check "the exam builder renders" "$(has "$JT" /staff/exams/new 'Duration (minutes)')" yes
check "exam detail shows the answer key" "$(has "$JT" "/staff/exams/$EXAM" 'Answer key')" yes
check "a published exam offers Close" "$(has "$JT" "/staff/exams/$EXAM" 'Close exam')" yes
check "an unknown exam is a 404" "$(code -b "$JT" "$WEB/staff/exams/00000000-0000-4000-8000-000000000000")" 404

echo "--- results ---"
check "results page shows the student" "$(has "$JT" "/staff/exams/$EXAM/results" 'Student 1')" yes
check "results page offers the CSV" "$(has "$JT" "/staff/exams/$EXAM/results" 'Download CSV')" yes
CSV=$(curl -s -b "$JT" "$WEB/api/staff/exams/$EXAM/results/csv")
check "CSV has the expected header" "$(head -n1 <<<"$CSV" | tr -d '\r')" 'Rank,Roll no.,Name,Status,Score,Max score,Percentage,Late answers,Submitted at'
check "CSV has the student's row" "$(grep -c 'DA-2026-001' <<<"$CSV" | awk '{print ($1>0)?"yes":"no"}')" yes
check "CSV is served as text/csv" "$(curl -s -o /dev/null -w '%{content_type}' -b "$JT" "$WEB/api/staff/exams/$EXAM/results/csv" | cut -d';' -f1)" text/csv

rm -f "$JA" "$JT" "$JS"
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
