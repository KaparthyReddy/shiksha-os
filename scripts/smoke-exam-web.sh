#!/usr/bin/env bash
# Usage: bash scripts/smoke-exam-web.sh   (API and web must be running)
set -euo pipefail
WEB=${WEB_URL:-http://localhost:3000}
API=${API_URL:-http://localhost:4000}
S=$(date +%s)
pass=0; fail=0
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
where() { curl -s -o /dev/null -w "%{redirect_url}" "$@" | sed "s|^$WEB||"; }

api_login() { curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$1\",\"password\":\"demo1234\"}" | json 'd.accessToken'; }
web_login() { curl -s -c "$1" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$2\",\"password\":\"demo1234\"}" >/dev/null; }
treq() { # method path [body]
  if [ -n "${3:-}" ]; then curl -s -X "$1" "$API$2" -H "authorization: Bearer $TEACHER" -H 'content-type: application/json' -d "$3"
  else curl -s -X "$1" "$API$2" -H "authorization: Bearer $TEACHER"; fi
}
px() { # jar method path [body]
  if [ -n "${4:-}" ]; then curl -s -b "$1" -c "$1" -X "$2" "$WEB/api/proxy/$3" -H 'content-type: application/json' -d "$4"
  else curl -s -b "$1" -c "$1" -X "$2" "$WEB/api/proxy/$3"; fi
}

TEACHER=$(api_login teacher@demo.test)
BATCH=$(treq GET /batches | json "d.find(b=>b.name==='NEET 2027 - Morning').id")
mkq() { treq POST /questions "{\"subject\":\"WebSmoke\",\"body\":\"$1 $S\",\"options\":[{\"id\":\"a\",\"text\":\"A\"},{\"id\":\"b\",\"text\":\"B\"},{\"id\":\"c\",\"text\":\"C\"}],\"correct\":[\"$2\"]}" | json 'd.id'; }
Q1=$(mkq Q1 a); Q2=$(mkq Q2 b)
EXAM=$(treq POST /exams "{\"title\":\"Web Smoke $S\",\"batchId\":\"$BATCH\",\"durationMinutes\":20,\"questionIds\":[\"$Q1\",\"$Q2\"]}" | json 'd.id')
treq POST "/exams/$EXAM/publish" >/dev/null
check "demo exam is ready" "$([ "$EXAM" != undefined ] && [ "$EXAM" != PARSE-ERROR ] && echo yes)" yes

JS=$(mktemp); JT=$(mktemp)
web_login "$JS" student1@demo.test
web_login "$JT" teacher@demo.test

check "proxy without a login is a JSON 401" "$(curl -s -X POST "$WEB/api/proxy/exams/$EXAM/start" | json 'd.error.code')" unauthorized
check "the exam page renders for a student" "$(code -b "$JS" "$WEB/exam/$EXAM")" 200
check "teachers are kept out of the exam page" "$(where -b "$JT" "$WEB/exam/$EXAM")" /teacher

START=$(px "$JS" POST "exams/$EXAM/start")
SESSION=$(echo "$START" | json 'd.session.id')
check "start through the proxy creates a session" "$([ "$SESSION" != undefined ] && [ "$SESSION" != PARSE-ERROR ] && echo yes)" yes
check "all questions delivered" "$(echo "$START" | json 'd.questions.length')" 2
check "the payload has no correct answers" "$(echo "$START" | json 'JSON.stringify(d).includes("\"correct\"")')" false
check "starting again resumes the same session" "$(px "$JS" POST "exams/$EXAM/start" | json "d.session.id==='$SESSION'")" true

check "endpoints outside the allowlist are blocked (students)" "$(code -b "$JS" "$WEB/api/proxy/students")" 404
check "endpoints outside the allowlist are blocked (results)" "$(code -b "$JS" "$WEB/api/proxy/exams/$EXAM/results")" 404
check "the clock endpoint answers" "$(px "$JS" GET "exam-sessions/$SESSION/time" | json 'Boolean(d.deadlineAt)')" true

NOW=$(node -pe 'Date.now()')
SYNC=$(px "$JS" POST "exam-sessions/$SESSION/answers" "{\"answers\":[{\"questionId\":\"$Q1\",\"response\":\"a\",\"markedForReview\":false,\"clientSeq\":1,\"clientTs\":$NOW},{\"questionId\":\"$Q2\",\"response\":\"a\",\"markedForReview\":true,\"clientSeq\":1,\"clientTs\":$NOW}]}")
check "sync through the proxy accepts both answers" "$(echo "$SYNC" | json 'd.accepted')" 2
check "resuming returns the saved answers" "$(px "$JS" GET "exam-sessions/$SESSION" | json 'd.answers.length')" 2

SUB=$(px "$JS" POST "exam-sessions/$SESSION/submit")
check "submit scores 3 (one right, one wrong at -1)" "$(echo "$SUB" | json 'd.total')" 3
check "submit is idempotent" "$(px "$JS" POST "exam-sessions/$SESSION/submit" | json 'd.total')" 3
check "starting again after submit is refused" "$(px "$JS" POST "exams/$EXAM/start" | json 'd.error.code')" conflict

rm -f "$JS" "$JT"
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
