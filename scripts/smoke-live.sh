#!/usr/bin/env bash
# Usage: bash scripts/smoke-live.sh   (API and web running, plus pnpm infra:up)
# Tests tokens, permissions, webhooks, attendance and pages. Real audio/video needs a hands-on test.
set -euo pipefail
cd "$(dirname "$0")/.."
API=${API_URL:-http://localhost:4000}
WEB=${WEB_URL:-http://localhost:3000}
S=$(date +%s)
pass=0; fail=0
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
where() { curl -s -o /dev/null -w "%{redirect_url}" "$@" | sed "s|^$WEB||"; }
has() { local html; html=$(curl -s -b "$1" "$WEB$2"); if grep -q -- "$3" <<<"$html"; then echo yes; else echo no; fi; }
login() { curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$1\",\"password\":\"${2:-demo1234}\"}" | json 'd.accessToken'; }
rq() { # token method path [body]
  if [ -n "${4:-}" ]; then curl -s -X "$2" "$API$3" -H "authorization: Bearer $1" -H 'content-type: application/json' -d "$4"
  else curl -s -X "$2" "$API$3" -H "authorization: Bearer $1"; fi
}
claims() { node -pe 'JSON.stringify(JSON.parse(Buffer.from(process.argv[1].split(".")[1],"base64url").toString()))' "$1"; }

KEY=$(grep -E '^LIVEKIT_API_KEY=' .env 2>/dev/null | cut -d= -f2- || true); KEY=${KEY:-devkey}
SECRET=$(grep -E '^LIVEKIT_API_SECRET=' .env 2>/dev/null | cut -d= -f2- || true); SECRET=${SECRET:-secretsecretsecretsecretsecretsecret}
hook() { # event identity [secret]
  local body sig
  body=$(node -pe 'JSON.stringify({event:process.argv[1],room:{name:process.argv[2]},participant:{identity:process.argv[3]},createdAt:Math.floor(Date.now()/1000)})' "$1" "$ROOM" "$2")
  sig=$(node -e '
    const c=require("crypto"); const [body,key,secret]=process.argv.slice(1);
    const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const now=Math.floor(Date.now()/1000);
    const h=b({alg:"HS256",typ:"JWT"});
    const p=b({iss:key,nbf:now-10,exp:now+300,sha256:c.createHash("sha256").update(body).digest("base64")});
    process.stdout.write(h+"."+p+"."+c.createHmac("sha256",secret).update(h+"."+p).digest("base64url"));
  ' "$body" "$KEY" "${3:-$SECRET}")
  curl -s -o /dev/null -w "%{http_code}" -X POST "$API/webhooks/livekit" -H "authorization: $sig" -H 'content-type: application/webhook+json' -d "$body"
}

AT=$(login admin@demo.test); TT=$(login teacher@demo.test); S1=$(login student1@demo.test)
OTHER=$(curl -s -X POST "$API/auth/login" -H 'content-type: application/json' -d '{"tenant":"other-academy","email":"admin@other.test","password":"demo1234"}' | json 'd.accessToken')
TENANT=$(rq "$AT" GET /auth/me | json 'd.tenantId')
COURSE=$(rq "$AT" GET /courses | json 'd[0].id')
BATCH=$(rq "$AT" POST /batches "{\"courseId\":\"$COURSE\",\"name\":\"Live Test $S\",\"capacity\":5}" | json 'd.id')
mkstu() { rq "$AT" POST /students "{\"name\":\"$1 $S\",\"email\":\"$2$S@demo.test\",\"rollNo\":\"$3-$S\",\"batchId\":\"$BATCH\"}"; }
A=$(mkstu LiveA livea LA); B=$(mkstu LiveB liveb LB)
ASID=$(echo "$A" | json 'd.student.id'); BSID=$(echo "$B" | json 'd.student.id'); APW=$(echo "$A" | json 'd.temporaryPassword')
SA=$(login "livea$S@demo.test" "$APW"); AUID=$(rq "$SA" GET /auth/me | json 'd.id')
SCHED=$(node -pe 'new Date(Date.now()+3600e3).toISOString()')
mk() { rq "$AT" POST /live-classes "{\"batchId\":\"$BATCH\",\"title\":\"$1\",\"scheduledAt\":\"$SCHED\",\"durationMinutes\":30}"; }

echo "--- scheduling and scope ---"
check "a teacher not assigned to the batch can't schedule there" "$(rq "$TT" POST /live-classes "{\"batchId\":\"$BATCH\",\"title\":\"Nope\",\"scheduledAt\":\"$SCHED\",\"durationMinutes\":30}" | json 'd.error.code')" not_found
check "a 1-minute class is refused" "$(rq "$AT" POST /live-classes "{\"batchId\":\"$BATCH\",\"title\":\"Short\",\"scheduledAt\":\"$SCHED\",\"durationMinutes\":1}" | json 'd.error.code')" validation_error
CLS=$(mk "Live $S" | json 'd.id')
check "admin schedules a class" "$([ "$CLS" != undefined ] && [ "$CLS" != PARSE-ERROR ] && echo yes)" yes
ROOM="$TENANT.$CLS"
check "the teacher can't see it before assignment" "$(rq "$TT" GET "/live-classes/$CLS" | json 'd.error.code')" not_found
check "...nor in their list" "$(rq "$TT" GET /live-classes | json "d.some(c=>c.id==='$CLS')")" false
FID=$(rq "$AT" GET "/faculty?q=teacher@demo.test" | json 'd.items[0].id')
rq "$AT" POST "/batches/$BATCH/teachers" "{\"facultyId\":\"$FID\"}" >/dev/null
check "after assignment the teacher sees the class" "$(rq "$TT" GET "/live-classes/$CLS" | json 'd.title')" "Live $S"
check "...and in their list" "$(rq "$TT" GET /live-classes | json "d.some(c=>c.id==='$CLS')")" true

echo "--- joining ---"
check "a student can't join before the teacher starts" "$(rq "$SA" POST "/live-classes/$CLS/join" | json 'd.error.code')" conflict
JT=$(rq "$TT" POST "/live-classes/$CLS/join")
check "the teacher's join starts the class" "$(rq "$TT" GET "/live-classes/$CLS" | json 'd.status')" live
TCL=$(claims "$(echo "$JT" | json 'd.token')")
check "the join response carries the LiveKit url" "$(echo "$JT" | json 'd.url.startsWith("ws")')" true
check "teacher token room is tenant.class" "$(echo "$TCL" | json 'd.video.room')" "$ROOM"
check "teacher token may publish" "$(echo "$TCL" | json 'd.video.canPublish')" true
check "the token identity is the teacher's own id" "$(echo "$TCL" | json 'd.sub')" "$(rq "$TT" GET /auth/me | json 'd.id')"
SCL=$(claims "$(rq "$SA" POST "/live-classes/$CLS/join" | json 'd.token')")
check "student token is for the same room" "$(echo "$SCL" | json 'd.video.room')" "$ROOM"
check "a student token can't publish" "$(echo "$SCL" | json 'd.video.canPublish')" false
check "a student token can subscribe and chat" "$(echo "$SCL" | json 'd.video.canSubscribe && d.video.canPublishData')" true
check "the token expires in the future" "$(echo "$SCL" | json 'd.exp > Date.now()/1000')" true
check "a student outside the batch can't join" "$(rq "$S1" POST "/live-classes/$CLS/join" | json 'd.error.code')" not_found
check "another institute can't see the class" "$(rq "$OTHER" GET "/live-classes/$CLS" | json 'd.error.code')" not_found
check "...nor join it" "$(rq "$OTHER" POST "/live-classes/$CLS/join" | json 'd.error.code')" not_found
check "a student can't use the staff detail endpoint" "$(rq "$SA" GET "/live-classes/$CLS" | json 'd.error.code')" forbidden

echo "--- LiveKit webhooks ---"
check "a webhook with a wrong signature is refused" "$(hook participant_joined "$AUID" wrongsecretwrongsecretwrongsecret12)" 401
check "a signed join webhook is accepted" "$(hook participant_joined "$AUID")" 200
sleep 2
check "a signed leave webhook is accepted" "$(hook participant_left "$AUID")" 200
DET=$(rq "$TT" GET "/live-classes/$CLS")
check "the roster shows student A joined" "$(echo "$DET" | json "d.roster.find(r=>r.studentId==='$ASID').firstJoinedAt!==null")" true
check "...with at least a second in class" "$(echo "$DET" | json "d.roster.find(r=>r.studentId==='$ASID').totalSeconds>=1")" true
check "...and one join counted" "$(echo "$DET" | json "d.roster.find(r=>r.studentId==='$ASID').joinCount")" 1
check "student B shows as not joined" "$(echo "$DET" | json "d.roster.find(r=>r.studentId==='$BSID').firstJoinedAt")" null
check "a webhook for an unknown user is accepted and ignored" "$(hook participant_joined 00000000-0000-4000-8000-000000000000)" 200

echo "--- ending and attendance ---"
check "attendance can't be marked while the class is live" "$(rq "$TT" POST "/live-classes/$CLS/attendance" '{"minMinutes":0.02}' | json 'd.error.code')" conflict
check "a student can't end the class" "$(rq "$SA" POST "/live-classes/$CLS/end" | json 'd.error.code')" forbidden
check "the teacher ends the class" "$(rq "$TT" POST "/live-classes/$CLS/end" | json 'd.status')" ended
check "a student can't join an ended class" "$(rq "$SA" POST "/live-classes/$CLS/join" | json 'd.error.code')" conflict
check "...nor can the teacher" "$(rq "$TT" POST "/live-classes/$CLS/join" | json 'd.error.code')" conflict
check "a class can't be ended twice" "$(rq "$TT" POST "/live-classes/$CLS/end" | json 'd.error.code')" conflict
AR=$(rq "$TT" POST "/live-classes/$CLS/attendance" '{"minMinutes":0.02}')
check "attendance marks the student who stayed present" "$(echo "$AR" | json 'd.present')" 1
check "...and the one who didn't absent" "$(echo "$AR" | json 'd.absent')" 1
DATE=$(echo "$AR" | json 'd.date')
ROSTER=$(rq "$TT" GET "/attendance?batchId=$BATCH&date=$DATE")
check "the register shows A present" "$(echo "$ROSTER" | json "d.find(r=>r.studentId==='$ASID').status")" present
check "the register shows B absent" "$(echo "$ROSTER" | json "d.find(r=>r.studentId==='$BSID').status")" absent
check "marking again is harmless" "$(rq "$TT" POST "/live-classes/$CLS/attendance" '{"minMinutes":0.02}' | json 'd.present')" 1
check "the student sees they attended" "$(rq "$SA" GET /me/live-classes | json "d.find(c=>c.id==='$CLS').attended")" true

echo "--- cancelling ---"
C2=$(mk "Cancel $S" | json 'd.id')
check "a scheduled class can be cancelled" "$(rq "$AT" POST "/live-classes/$C2/cancel" | json 'd.status')" cancelled
check "a cancelled class can't be joined" "$(rq "$AT" POST "/live-classes/$C2/join" | json 'd.error.code')" conflict
check "...or cancelled twice" "$(rq "$AT" POST "/live-classes/$C2/cancel" | json 'd.error.code')" conflict
check "a student can't see a cancelled class" "$(rq "$SA" GET /me/live-classes | json "d.some(c=>c.id==='$C2')")" false

echo "--- web ---"
JA=$(mktemp); JT=$(mktemp); JS=$(mktemp)
curl -s -c "$JA" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' -d '{"tenant":"demo-academy","email":"admin@demo.test","password":"demo1234"}' >/dev/null
curl -s -c "$JT" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' -d '{"tenant":"demo-academy","email":"teacher@demo.test","password":"demo1234"}' >/dev/null
curl -s -c "$JS" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' -d "{\"tenant\":\"demo-academy\",\"email\":\"livea$S@demo.test\",\"password\":\"$APW\"}" >/dev/null
check "the staff live page renders for the teacher" "$(has "$JT" /staff/live 'Schedule a class')" yes
check "...and lists the class" "$(has "$JT" /staff/live "Live $S")" yes
check "admins get the same page" "$(has "$JA" /staff/live 'Schedule a class')" yes
check "the class detail page renders" "$(has "$JT" "/staff/live/$CLS" "Live $S")" yes
check "an ended class offers attendance marking" "$(has "$JT" "/staff/live/$CLS" 'Mark attendance from this class')" yes
check "an unknown class is a 404" "$(code -b "$JT" "$WEB/staff/live/00000000-0000-4000-8000-000000000000")" 404
check "students are kept out of staff live pages" "$(where -b "$JS" "$WEB/staff/live")" /student
check "the student's live page lists the class" "$(has "$JS" /student/live "Live $S")" yes
check "the room page has a Join button" "$(has "$JS" "/live/$CLS" 'Join class')" yes
check "anonymous join through the web is a JSON 401" "$(curl -s -X POST "$WEB/api/live/$CLS/join" | json 'd.error.code')" unauthorized
check "joining an ended class through the web is refused" "$(curl -s -b "$JS" -X POST "$WEB/api/live/$CLS/join" | json 'd.error.code')" conflict
check "a malformed class id is a 404" "$(code -b "$JS" -X POST "$WEB/api/live/not-an-id/join")" 404
check "other actions through the web route are a 404" "$(code -b "$JT" -X POST "$WEB/api/live/$CLS/delete")" 404
rm -f "$JA" "$JT" "$JS"

check "audit chain is intact" "$(rq "$AT" GET /audit/verify | json 'd.ok')" true
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
