#!/bin/sh
# Server-side deploy for batch.bodylia.in (runs ON 209.182.235.68 via CI SSH).
# Env (from CI secrets, never stored on disk): DB_PASSWORD JWT_SECRET
# CAPTCHA_SECRET EMAILIT_API_KEY PROD_ADMIN_EMAIL PROD_ADMIN_PASSWORD,
# IMAGE_TAG (commit SHA).
# Steps: compose build -> stack up -> wait API healthy -> nginx install ->
# certbot (first run only) -> smoke (canonical/spaced/mfg/unknown/malformed
# + no-demo-users check).
set -eu
DEPLOY_DIR="/opt/bodyliabatch"
cd "$DEPLOY_DIR"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"
: "${CAPTCHA_SECRET:?CAPTCHA_SECRET is required}"
: "${EMAILIT_API_KEY:?EMAILIT_API_KEY is required}"
: "${PROD_ADMIN_EMAIL:?PROD_ADMIN_EMAIL is required}"
: "${PROD_ADMIN_PASSWORD:?PROD_ADMIN_PASSWORD is required}"
TAG="${IMAGE_TAG:-latest}"
COMPOSE="docker compose -f deploy/docker-compose.prod.yml"
export DB_USER="${DB_USER:-bodylia}" DB_NAME="${DB_NAME:-bodyliabatch_prod}" TAG

echo "==> 1/6 compose build (tag $TAG)"
DB_PASSWORD="$DB_PASSWORD" JWT_SECRET="$JWT_SECRET" CAPTCHA_SECRET="$CAPTCHA_SECRET" EMAILIT_API_KEY="$EMAILIT_API_KEY" PROD_ADMIN_EMAIL="$PROD_ADMIN_EMAIL"   PROD_ADMIN_PASSWORD="$PROD_ADMIN_PASSWORD" IMAGE_TAG="$TAG" $COMPOSE build

echo "==> 2/6 stack up (migrations + prod bootstrap run on API boot)"
DB_PASSWORD="$DB_PASSWORD" JWT_SECRET="$JWT_SECRET" CAPTCHA_SECRET="$CAPTCHA_SECRET" EMAILIT_API_KEY="$EMAILIT_API_KEY" PROD_ADMIN_EMAIL="$PROD_ADMIN_EMAIL"   PROD_ADMIN_PASSWORD="$PROD_ADMIN_PASSWORD" IMAGE_TAG="$TAG" $COMPOSE up -d

echo "==> 3/6 wait for API healthy (max 5 min)"
for i in $(seq 1 30); do
  if $COMPOSE exec -T batch-api curl -fsS http://127.0.0.1:8101/api/health >/dev/null 2>&1; then
    echo "API healthy after $((i * 10))s"
    break
  fi
  if [ "$i" = 30 ]; then echo "API never became healthy" >&2; $COMPOSE logs --tail=60 batch-api; exit 1; fi
  sleep 10
done

echo "==> 4/6 host nginx (bodyliabatch.conf) + reload"
sudo cp "$DEPLOY_DIR/deploy/bodyliabatch.conf" /etc/nginx/sites-available/bodyliabatch.conf
sudo ln -sf /etc/nginx/sites-available/bodyliabatch.conf /etc/nginx/sites-enabled/bodyliabatch.conf
sudo nginx -t
sudo systemctl reload nginx

echo "==> 5/6 TLS via certbot (idempotent; skips when cert exists)"
if [ ! -f /etc/letsencrypt/live/batch.bodylia.in/fullchain.pem ]; then
  sudo certbot --nginx -d batch.bodylia.in --non-interactive --agree-tos     --email "${CERTBOT_EMAIL:-$PROD_ADMIN_EMAIL}" --redirect
else
  echo "cert exists — renew check only"
  sudo certbot renew --quiet --deploy-hook "systemctl reload nginx" || true
fi

echo "==> 6/6 smoke (live https://batch.bodylia.in)"
BASE="https://batch.bodylia.in"
fail=0
check() { # $1 path $2 expected-substring $3 label
  out=$(curl -fsS --max-time 20 "$BASE$1" 2>&1) || { echo "FAIL $3: curl error"; echo "$out" | head -c 300; echo; fail=1; return; }
  case "$out" in
    *"$2"*) echo "OK $3" ;;
    *) echo "FAIL $3: missing [$2]"; echo "$out" | head -c 400; echo; fail=1 ;;
  esac
}
# health may be plain-http behind certbot; accept either
curl -fsS --max-time 20 "$BASE/health" >/dev/null 2>&1 || curl -fsS --max-time 20 "http://batch.bodylia.in/health" >/dev/null && echo "OK health"
check "/bff/v1/batches/PE-2610-WL01" '"kind":"genuine"' "canonical genuine"
check "/bff/v1/batches/pe%202610%20wl01" 'PE-2610-WL01' "spaced input"
check "/bff/v1/batches/2K26001" '"matchedKind":"manufacturer"' "manufacturer mapping"
# unknown + malformed must be neutral 404s
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/bff/v1/batches/ZZ-9999-9Z99"); [ "$code" = 404 ] && echo "OK unknown 404" || { echo "FAIL unknown: http $code"; fail=1; }
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/bff/v1/batches/F-261-0W"); [ "$code" = 404 ] && echo "OK malformed 404" || { echo "FAIL malformed: http $code"; fail=1; }
# homepage must not leak demo users
if curl -fsS --max-time 20 "$BASE/" | grep -qi 'qa@bodylia.in\|support@bodylia.in\|vikram.r@\|farah.k@'; then
  echo "FAIL homepage leaks demo users"; fail=1
else
  echo "OK no demo users on homepage"
fi
# admin login page reachable
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/#/console"); [ "$code" = 200 ] && echo "OK console route" || { echo "FAIL console: http $code"; fail=1; }
if [ "$fail" != 0 ]; then echo "SMOKE FAILED" >&2; exit 1; fi
echo "DEPLOY OK — batch.bodylia.in live on tag $TAG"
