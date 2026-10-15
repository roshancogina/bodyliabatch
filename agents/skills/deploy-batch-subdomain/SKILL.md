# Skill: deploy-batch-subdomain

Ship the static SPA as https://batch.bodylia.in.

## Build
`npm ci && npm run build` → `dist/`. Hash routing (`src/lib/router.ts`) means the
server never needs SPA rewrites, but QR deep links use the query form
`https://batch.bodylia.in/?b=BDL-FR-2509-0312` — preserved by the nginx config.

## Nginx
Drop-in: `deploy/nginx-batch-bodylia.conf`.
- `server_name batch.bodylia.in`, HTTP→HTTPS, Let's Encrypt certs.
- `/assets/` cached immutable 1y; images revalidate 1h; PDFs download.
- `/health` for uptime checks.

## Docker
`deploy/Dockerfile` (nginx:alpine + `dist/`). Compose snippet in
`deploy/docker-compose.batch.yml` — port 4173, restart unless-stopped.

## DNS
`batch` CNAME/A → same VPS as `bodylia.com`. Verify:
`dig batch.bodylia.in +short` and `curl -I https://batch.bodylia.in/health`.

## Rollback
Keep previous `dist/` image tagged; `docker rollback` or re-`up -d` the prior tag.
