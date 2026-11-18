#!/usr/bin/env bash
# Smoke test for a running API. Usage: bash scripts/smoke-api.sh
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
login() { # tenant email password
  curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
    -d "{\"tenant\":\"$1\",\"email\":\"$2\",\"password\":\"${3:-demo1234}\"}" | json 'd.accessToken'
}
check() { # label actual expected
  if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi
}

ADMIN=$(login demo-academy admin@demo.test)
TEACHER=$(login demo-academy teacher@demo.test)
OTHER=$(login other-academy admin@other.test)

COURSE=$(req POST /courses "$ADMIN" "{\"name\":\"Smoke Course $S\",\"code\":\"sm$S\"}" | json 'd.id')
check "admin creates a course" "$([ "$COURSE" != undefined ] && echo yes)" yes

BATCH=$(req POST /batches "$ADMIN" "{\"courseId\":\"$COURSE\",\"name\":\"Smoke Batch\",\"capacity\":2}" | json 'd.id')
check "admin creates a batch" "$([ "$BATCH" != undefined ] && echo yes)" yes

CREATED=$(req POST /students "$ADMIN" "{\"name\":\"Smoke Student\",\"email\":\"smoke$S@demo.test\",\"rollNo\":\"SM-$S\",\"batchId\":\"$BATCH\"}")
SID=$(echo "$CREATED" | json 'd.student.id')
TEMP=$(echo "$CREATED" | json 'd.temporaryPassword')
check "admin creates a student with a temp password" "$([ "$SID" != undefined ] && [ "$TEMP" != undefined ] && echo yes)" yes

check "student search finds exactly 1" "$(req GET "/students?q=SM-$S" "$ADMIN" | json 'd.total')" 1
check "batch roster shows 1 enrolled" "$(req GET "/batches/$BATCH" "$ADMIN" | json 'd.enrolled')" 1
check "duplicate roll number is rejected" "$(req POST /students "$ADMIN" "{\"name\":\"Dup\",\"email\":\"dup$S@demo.test\",\"rollNo\":\"SM-$S\"}" | json 'd.error.code')" conflict
check "course with batches cannot be deleted" "$(req DELETE "/courses/$COURSE" "$ADMIN" | json 'd.error.code')" conflict

check "teacher can read students" "$(req GET /students "$TEACHER" | json 'd.total>=1')" true
check "teacher cannot create a course" "$(req POST /courses "$TEACHER" '{"name":"No Way","code":"NOPE"}' | json 'd.error.code')" forbidden

STUDENT=$(login demo-academy "smoke$S@demo.test" "$TEMP")
check "new student logs in with the temp password" "$(req GET /auth/me "$STUDENT" | json 'd.role')" student
check "student cannot list students" "$(req GET /students "$STUDENT" | json 'd.error.code')" forbidden

check "other tenant cannot search our students" "$(req GET "/students?q=SM-$S" "$OTHER" | json 'd.total')" 0
check "other tenant gets 404 on our student" "$(req GET "/students/$SID" "$OTHER" | json 'd.error.code')" not_found
check "other tenant cannot attach a batch to our course" "$(req POST /batches "$OTHER" "{\"courseId\":\"$COURSE\",\"name\":\"Evil\"}" | json 'd.error.code')" not_found

req PATCH "/students/$SID" "$ADMIN" '{"isActive":false}' > /dev/null
check "deactivated student can no longer log in" "$(login demo-academy "smoke$S@demo.test" "$TEMP")" undefined

check "audit chain is intact" "$(req GET /audit/verify "$ADMIN" | json 'd.ok')" true

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
