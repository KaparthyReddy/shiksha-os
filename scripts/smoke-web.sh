#!/usr/bin/env bash
# Usage: bash scripts/smoke-web.sh   (API and web must be running)
set -euo pipefail
WEB=${WEB_URL:-http://localhost:3000}
API=${API_URL:-http://localhost:4000}
pass=0; fail=0
json() { node -pe "try { const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1 } catch(e) { 'PARSE-ERROR' }"; }
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1)); else echo "✘ $1 (got: $2, want: $3)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
where() { curl -s -o /dev/null -w "%{redirect_url}" "$@" | sed "s|^$WEB||"; }
login() { # jar email password
  curl -s -c "$1" -X POST "$WEB/api/auth/login" -H 'content-type: application/json' \
    -d "{\"tenant\":\"demo-academy\",\"email\":\"$2\",\"password\":\"${3:-demo1234}\"}"
}
JA=$(mktemp); JS=$(mktemp); JX=$(mktemp)

check "anonymous users are sent to /login" "$(where "$WEB/admin")" /login
check "the login page renders" "$(code "$WEB/login")" 200
check "a wrong password is rejected" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/auth/login" -H 'content-type: application/json' -d '{"tenant":"demo-academy","email":"admin@demo.test","password":"wrong-password"}')" 401

check "admin can sign in" "$(login "$JA" admin@demo.test | json 'd.user.role')" admin
check "login response carries no tokens" "$(curl -s -X POST "$WEB/api/auth/login" -H 'content-type: application/json' -d '{"tenant":"demo-academy","email":"admin@demo.test","password":"demo1234"}' | json 'JSON.stringify(d).includes("Token")')" false
check "both cookies are httpOnly" "$(grep -c '^#HttpOnly_' "$JA")" 2
check "admin dashboard renders for admin" "$(code -b "$JA" "$WEB/admin")" 200
check "dashboard shows the institute name" "$(curl -s -b "$JA" "$WEB/admin" | grep -c 'Demo Academy' | awk '{print ($1>0)?"yes":"no"}')" yes
check "/ sends admin to /admin" "$(where -b "$JA" "$WEB/")" /admin
check "admin is kept out of /student" "$(where -b "$JA" "$WEB/student")" /admin

check "student can sign in" "$(login "$JS" student1@demo.test | json 'd.user.role')" student
check "student is kept out of /admin" "$(where -b "$JS" "$WEB/admin")" /student
check "student home renders" "$(curl -s -b "$JS" "$WEB/student" | grep -c 'My exams' | awk '{print ($1>0)?"yes":"no"}')" yes

# Delete the access cookie: middleware must refresh it from the refresh cookie.
grep -v 'shiksha_at' "$JA" > "$JX" || true
check "dashboard still loads without an access cookie" "$(code -b "$JX" -c "$JX" "$WEB/admin")" 200
check "middleware issued a fresh access cookie" "$(grep -c 'shiksha_at' "$JX")" 1

RT=$(awk -F'\t' '$6=="shiksha_rt"{print $7}' "$JA")
curl -s -b "$JA" -c "$JA" -X POST "$WEB/api/auth/logout" >/dev/null
check "after logout the dashboard redirects to /login" "$(where -b "$JA" "$WEB/admin")" /login
check "the old refresh token is dead server-side" "$(curl -s -X POST "$API/auth/refresh" -H 'content-type: application/json' -d "{\"refreshToken\":\"$RT\"}" | json 'd.error.code')" unauthorized

rm -f "$JA" "$JS" "$JX"
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
