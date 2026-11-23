#!/usr/bin/env bash
# Usage: bash scripts/smoke-account.sh   (API, worker and web must be running)
set -euo pipefail
cd "$(dirname "$0")/.."
API=${API_URL:-http://localhost:4000}
WEB=${WEB_URL:-http://localhost:3000}
MAILPIT=${MAILPIT_URL:-http://localhost:8025}
S=$(date +%s)
EMAIL="acct$S@demo.test"
pass=0; fail=0
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
where() { curl -s -o /dev/null -w "%{redirect_url}" "$@" | sed "s|^$WEB||"; }
has() { local html; html=$(curl -s ${1:+-b "$1"} "$WEB$2"); if grep -q -- "$3" <<<"$html"; then echo yes; else echo no; fi; }
sql() { docker compose -f infra/docker-compose.yml exec -T postgres psql -U shiksha -d shiksha -tAc "$1" | tr -d ' \r\n'; }
login() { curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$1\",\"password\":\"$2\"}"; }
rq() { # token method path [body]
  if [ -n "${4:-}" ]; then curl -s -X "$2" "$API$3" -H "authorization: Bearer $1" -H 'content-type: application/json' -d "$4"
  else curl -s -X "$2" "$API$3" -H "authorization: Bearer $1"; fi
}
pub() { curl -s -X POST "$API$1" -H 'content-type: application/json' -d "$2"; }
mail_id() { curl -s "$MAILPIT/api/v1/messages?limit=200" | json "(d.messages.find(m=>m.To.some(t=>t.Address==='$EMAIL')&&m.Subject.includes('Reset'))||{}).ID"; }
wait_mail() { local end=$((SECONDS + $1)) id; while [ "$SECONDS" -lt "$end" ]; do id=$(mail_id); if [ -n "$id" ] && [ "$id" != undefined ] && [ "$id" != PARSE-ERROR ]; then echo "$id"; return; fi; sleep 3; done; echo ""; }
wait_sql() { local end=$((SECONDS + $1)); while [ "$SECONDS" -lt "$end" ]; do if [ "$(sql "$2")" = "$3" ]; then echo true; return; fi; sleep 2; done; echo false; }

curl -sf "$MAILPIT/api/v1/info" >/dev/null || { echo "Mailpit not reachable at $MAILPIT (is pnpm infra:up running?)"; exit 1; }

AT=$(login admin@demo.test demo1234 | json 'd.accessToken')
NEW=$(rq "$AT" POST /students "{\"name\":\"Account Test $S\",\"email\":\"$EMAIL\",\"rollNo\":\"ACCT-$S\"}")
TP=$(echo "$NEW" | json 'd.temporaryPassword')
check "test account created with a temporary password" "$([ "$TP" != undefined ] && echo yes)" yes

echo "--- change password ---"
L1=$(login "$EMAIL" "$TP")
UT=$(echo "$L1" | json 'd.accessToken'); RT1=$(echo "$L1" | json 'd.refreshToken')
chg() { rq "$UT" POST /auth/change-password "{\"currentPassword\":\"$1\",\"newPassword\":\"$2\"}"; }
check "a wrong current password is a 400, not a 401" "$(chg wrong-password NewPass-$S-1 | json 'd.error.code')" wrong_password
check "a weak new password is refused" "$(chg "$TP" password123 | json 'd.error.code')" bad_request
check "reusing the current password is refused" "$(chg "$TP" "$TP" | json 'd.error.code')" bad_request
check "a password equal to the email is refused" "$(chg "$TP" "$EMAIL" | json 'd.error.code')" bad_request
CH=$(chg "$TP" "NewPass-$S-1")
check "a valid change returns a fresh session" "$(echo "$CH" | json 'Boolean(d.accessToken && d.refreshToken)')" true
RT2=$(echo "$CH" | json 'd.refreshToken')
check "the old session's refresh token is dead" "$(pub /auth/refresh "{\"refreshToken\":\"$RT1\"}" | json 'd.error.code')" unauthorized
check "the new session's refresh token works" "$(pub /auth/refresh "{\"refreshToken\":\"$RT2\"}" | json 'Boolean(d.accessToken)')" true
check "the old password no longer signs in" "$(login "$EMAIL" "$TP" | json 'd.error.code')" unauthorized
check "the new password signs in" "$(login "$EMAIL" "NewPass-$S-1" | json 'Boolean(d.accessToken)')" true

echo "--- forgot password ---"
FR=$(pub /auth/forgot-password "{\"tenant\":\"demo-academy\",\"email\":\"$EMAIL\"}")
echo "  debug: forgot raw -> $FR"
echo "  debug: reset rows for $EMAIL: $(sql "select count(*) from password_resets pr join users u on u.id=pr.user_id where u.email='$EMAIL'")"
check "forgot-password answers ok for a real account" "$(echo "$FR" | json 'd.ok')" true
check "...and identically for an unknown email" "$(pub /auth/forgot-password "{\"tenant\":\"demo-academy\",\"email\":\"nobody$S@demo.test\"}" | json 'd.ok')" true
check "...and for an unknown institute" "$(pub /auth/forgot-password "{\"tenant\":\"no-such-institute\",\"email\":\"$EMAIL\"}" | json 'd.ok')" true
check "a malformed request is rejected" "$(pub /auth/forgot-password '{"tenant":"demo-academy","email":"not-an-email"}' | json 'd.error.code')" validation_error
MID=$(wait_mail 60)
check "the reset email arrives in Mailpit within 60s" "$([ -n "$MID" ] && echo yes)" yes
TEXT=$(curl -s "$MAILPIT/api/v1/message/$MID" | json 'd.Text')
TOKEN=$(sed -n 's/.*token=\([^[:space:]]*\).*/\1/p' <<<"$TEXT" | head -n1)
check "the email contains a reset link" "$([ -n "$TOKEN" ] && echo yes)" yes
check "the stored email body is blanked after sending" "$(wait_sql 20 "select body_text = '' from email_outbox where to_email='$EMAIL' order by id desc limit 1" t)" true

L2=$(login "$EMAIL" "NewPass-$S-1"); RT3=$(echo "$L2" | json 'd.refreshToken')
res() { pub /auth/reset-password "{\"token\":\"$1\",\"newPassword\":\"$2\"}"; }
check "a garbage token is refused" "$(res "not-a-real-token-at-all-nope" "ResetPass-$S-2" | json 'd.error.code')" invalid_token
check "a weak password is refused on reset" "$(res "$TOKEN" password123 | json 'd.error.code')" bad_request
check "the link resets the password" "$(res "$TOKEN" "ResetPass-$S-2" | json 'd.ok')" true
check "the link works only once" "$(res "$TOKEN" "ResetPass-$S-3" | json 'd.error.code')" invalid_token
check "the reset password signs in" "$(login "$EMAIL" "ResetPass-$S-2" | json 'Boolean(d.accessToken)')" true
check "the previous password no longer signs in" "$(login "$EMAIL" "NewPass-$S-1" | json 'd.error.code')" unauthorized
check "a reset signs out every device" "$(pub /auth/refresh "{\"refreshToken\":\"$RT3\"}" | json 'd.error.code')" unauthorized

echo "--- web ---"
JU=$(mktemp)
curl -s -c "$JU" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' \
  -d "{\"tenant\":\"demo-academy\",\"email\":\"$EMAIL\",\"password\":\"ResetPass-$S-2\"}" >/dev/null
check "the forgot-password page is public" "$(code "$WEB/forgot-password")" 200
check "the forgot-password form is on the page" "$(has "" /forgot-password 'Send reset link')" yes
check "the reset page is public" "$(code "$WEB/reset-password?token=abc")" 200
check "the reset form is on the page" "$(has "" '/reset-password?token=abc' 'Set new password')" yes
check "the login page links to forgot-password" "$(has "" /login 'Forgot password')" yes
check "the account page requires sign-in" "$(where "$WEB/account")" /login
check "the account page renders for a signed-in user" "$(has "$JU" /account 'Change password')" yes
check "the account page shows the email" "$(has "$JU" /account "$EMAIL")" yes

check "audit chain is intact" "$(rq "$AT" GET /audit/verify | json 'd.ok')" true
rm -f "$JU"
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
