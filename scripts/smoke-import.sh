#!/usr/bin/env bash
# Usage: bash scripts/smoke-import.sh   (API and web must be running; after the Batch 12 setup commands)
set -euo pipefail
API=${API_URL:-http://localhost:4000}
WEB=${WEB_URL:-http://localhost:3000}
S=$(date +%s)
pass=0; fail=0
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi; }
where() { curl -s -o /dev/null -w "%{redirect_url}" "$@" | sed "s|^$WEB||"; }
login() { curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$1\",\"password\":\"${2:-demo1234}\"}" | json 'd.accessToken'; }
web_login() { curl -s -c "$1" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$2\",\"password\":\"demo1234\"}" >/dev/null; }
has() { local html; html=$(curl -s -b "$1" "$WEB$2"); if grep -q -- "$3" <<<"$html"; then echo yes; else echo no; fi; }
rq() { # token method path [body]
  if [ -n "${4:-}" ]; then curl -s -X "$2" "$API$3" -H "authorization: Bearer $1" -H 'content-type: application/json' -d "$4"
  else curl -s -X "$2" "$API$3" -H "authorization: Bearer $1"; fi
}
body() { node -pe 'JSON.stringify(Object.assign({csv: process.argv[1]}, process.argv[2] ? {batchId: process.argv[2]} : {}))' "$1" "${2:-}"; }

AT=$(login admin@demo.test); TT=$(login teacher@demo.test)
NEET=$(rq "$AT" GET /batches | json "d.find(b=>b.name==='NEET 2027 - Morning').id")
check "found the demo batch" "$([ "$NEET" != undefined ] && echo yes)" yes

echo "--- students: preview ---"
CSV=$(cat <<EOF
name,email,roll_no,guardian_name,guardian_phone,batch
Imp One $S,imp1.$S@demo.test,IMP-$S-1,Guardian One,9000000001,
Imp Two $S,imp2.$S@demo.test,IMP-$S-2,,,
Bad Email $S,not-an-email,IMP-$S-3,,,
Dup Roll $S,imp4.$S@demo.test,IMP-$S-1,,,
Existing $S,admin@demo.test,IMP-$S-5,,,
Unknown Batch $S,imp6.$S@demo.test,IMP-$S-6,,,No Such Batch
EOF
)
P=$(rq "$AT" POST /imports/students/preview "$(body "$CSV")")
check "preview: 2 rows are ready" "$(echo "$P" | json 'd.summary.valid')" 2
check "preview: 4 rows have problems" "$(echo "$P" | json 'd.summary.invalid')" 4
check "preview names the bad email" "$(echo "$P" | json "d.rows.find(r=>r.line===4).errors.join().includes('valid email')")" true
check "preview catches a repeated roll number" "$(echo "$P" | json "d.rows.find(r=>r.line===5).errors.join().includes('roll number already appears')")" true
check "preview catches an existing email" "$(echo "$P" | json "d.rows.find(r=>r.line===6).errors.join().includes('already exists')")" true
check "preview catches an unknown batch" "$(echo "$P" | json "d.rows.find(r=>r.line===7).errors.join().includes('No Such Batch')")" true
check "preview writes nothing" "$(rq "$AT" GET "/students?q=IMP-$S" | json 'd.total')" 0

NOCOL=$(printf 'name,email\nA,a@x.com\n')
check "a missing required column is explained" "$(rq "$AT" POST /imports/students/preview "$(body "$NOCOL")" | json 'd.error.message.includes("Missing required")')" true
SEMI=$(printf 'name;email;roll_no\nSemi One %s;semi1.%s@demo.test;SEMI-%s-1\n' "$S" "$S" "$S")
check "semicolon-separated files work" "$(rq "$AT" POST /imports/students/preview "$(body "$SEMI")" | json 'd.summary.valid')" 1
check "teachers cannot import" "$(rq "$TT" POST /imports/students/preview "$(body "$CSV")" | json 'd.error.code')" forbidden

echo "--- students: import ---"
R=$(rq "$AT" POST /imports/students "$(body "$CSV")")
check "import creates the 2 valid rows" "$(echo "$R" | json 'd.summary.created')" 2
check "import skips the 4 invalid rows" "$(echo "$R" | json 'd.summary.skipped')" 4
check "each new account gets a temporary password" "$(echo "$R" | json 'd.created.every(c=>c.temporaryPassword.length===12)')" true
PW=$(echo "$R" | json 'd.created[0].temporaryPassword')
check "the new students are searchable" "$(rq "$AT" GET "/students?q=IMP-$S" | json 'd.total')" 2
STU=$(login "imp1.$S@demo.test" "$PW")
check "an imported student can sign in" "$(rq "$STU" GET /auth/me | json 'd.role')" student
check "importing the same file again creates nothing" "$(rq "$AT" POST /imports/students "$(body "$CSV")" | json 'd.summary.created')" 0

echo "--- students: batch capacity ---"
COURSE=$(rq "$AT" GET /courses | json 'd[0].id')
CAPB=$(rq "$AT" POST /batches "{\"courseId\":\"$COURSE\",\"name\":\"Import Cap $S\",\"capacity\":1}" | json 'd.id')
CAP=$(printf 'name,email,roll_no\nCap One %s,cap1.%s@demo.test,CAP-%s-1\nCap Two %s,cap2.%s@demo.test,CAP-%s-2\n' "$S" "$S" "$S" "$S" "$S" "$S")
RC=$(rq "$AT" POST /imports/students "$(body "$CAP" "$CAPB")")
check "a batch with 1 seat takes 1 student" "$(echo "$RC" | json 'd.summary.created')" 1
check "the second student is refused as full" "$(echo "$RC" | json 'd.skipped[0].errors.join().includes("full")')" true
check "the batch roster shows 1 enrolled" "$(rq "$AT" GET "/batches/$CAPB" | json 'd.enrolled')" 1

echo "--- faculty ---"
FCSV=$(printf 'name,email,designation,subjects\nFac One %s,fac1.%s@demo.test,Physics Lead,Physics; Mathematics\nFac Two %s,fac2.%s@demo.test,,\nFac Bad %s,bad-email,,\n' "$S" "$S" "$S" "$S" "$S")
FR=$(rq "$AT" POST /imports/faculty "$(body "$FCSV")")
check "faculty import creates 2 and skips 1" "$(echo "$FR" | json '[d.summary.created,d.summary.skipped].join()')" 2,1
FPW=$(echo "$FR" | json 'd.created[0].temporaryPassword')
FID=$(rq "$AT" GET "/faculty?q=fac1.$S" | json 'd.items[0].id')
check "subjects were split on the semicolon" "$(rq "$AT" GET "/faculty?q=fac1.$S" | json 'd.items[0].subjects.join("|")')" "Physics|Mathematics"
FT=$(login "fac1.$S@demo.test" "$FPW")
check "an imported teacher can sign in" "$(rq "$FT" GET /auth/me | json 'd.role')" teacher

echo "--- teacher-to-batch assignment ---"
check "a new teacher sees no batches yet" "$(rq "$FT" GET /batches | json 'd.length')" 0
check "admin assigns the teacher to the batch" "$(rq "$AT" POST "/batches/$CAPB/teachers" "{\"facultyId\":\"$FID\"}" | json 'd.ok')" true
check "assigning twice is refused" "$(rq "$AT" POST "/batches/$CAPB/teachers" "{\"facultyId\":\"$FID\"}" | json 'd.error.code')" conflict
check "the teacher now sees exactly that batch" "$(rq "$FT" GET /batches | json 'd.map(b=>b.name).join()')" "Import Cap $S"
check "other batches are hidden from the teacher" "$(rq "$FT" GET "/batches/$NEET" | json 'd.error.code')" not_found
check "the teacher cannot open another batch's register" "$(rq "$FT" GET "/attendance?batchId=$NEET&date=$(date +%F)" | json 'd.error.code')" not_found
check "the teacher can open their own batch's register" "$(rq "$FT" GET "/attendance?batchId=$CAPB&date=$(date +%F)" | json 'Array.isArray(d)')" true
check "the batch lists its teacher" "$(rq "$FT" GET "/batches/$CAPB/teachers" | json 'd.length')" 1
check "the demo teacher still sees the demo batch" "$(rq "$TT" GET /batches | json "d.some(b=>b.name==='NEET 2027 - Morning')")" true
check "admins still see every batch" "$(rq "$AT" GET /batches | json 'd.length>=2')" true
check "unassigning works" "$(rq "$AT" DELETE "/batches/$CAPB/teachers/$FID" | json 'd.ok')" true
check "after that the teacher sees no batches" "$(rq "$FT" GET /batches | json 'd.length')" 0

echo "--- web ---"
JA=$(mktemp); JT=$(mktemp)
web_login "$JA" admin@demo.test
web_login "$JT" teacher@demo.test
check "import page renders" "$(has "$JA" /admin/import 'Bulk import')" yes
check "faculty tab renders" "$(has "$JA" '/admin/import?kind=faculty' 'Separate several subjects')" yes
check "the template download is offered" "$(has "$JA" /admin/import 'Download template')" yes
check "teachers are kept out of import" "$(where -b "$JT" "$WEB/admin/import")" /teacher
check "the batch page lists its teacher" "$(has "$JA" "/admin/batches/$NEET" 'Demo Teacher')" yes
check "the teacher home lists their batches" "$(has "$JT" /teacher 'Your batches')" yes
rm -f "$JA" "$JT"

check "audit chain is intact" "$(rq "$AT" GET /audit/verify | json 'd.ok')" true
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
