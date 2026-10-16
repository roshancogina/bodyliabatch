# Ubuntu 24.04 deployment dry-run — batch.bodylia.in

Preps a production-identical deployment without touching live infra.
Target host: fresh **Ubuntu 24.04** with Docker Engine + Compose plugin.

## 0. Host prep (Ubuntu 24.04)

```sh
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin curl
sudo usermod -aG docker "$USER" && newgrp docker
git clone <repo> bodyliabatch && cd bodyliabatch
cp deploy/.env.deploy.example .env.deploy
# fill DB_PASSWORD + JWT_SECRET (32+ random chars), confirm ALLOWED_ORIGINS
```

## 1. Dry-run gate (everything, in order)

```sh
./deploy/dryrun-ubuntu.sh
```

What it runs: `typecheck` → vitest **100% statements/lines** → `go vet` + 25 Go tests →
compose build (Ubuntu 24.04 images) → stack up → API healthy → seed counts
(10 batches / 11 aliases / 6 products) → UIBatch smoke via nginx:

| Probe | Expect |
|---|---|
| `GET /health` | `ok` |
| `GET /bff/v1/batches/PE-2610-WL01` | `genuine`, record `PE-2610-WL01` |
| `GET /bff/v1/batches/pe%202610%20wl01` | same (spaces stripped, case-insensitive) |
| `GET /bff/v1/batches/2K26001` | same + `matchedAlias: 2K26001`, `matchedKind: manufacturer` |
| `GET /bff/v1/batches/2K26005` | `genuine`, record `CI-2610-WL01` + manufacturer kind |
| `GET /bff/v1/batches/ZZ-9999-9Z99` | 404 `not_found` (neutral copy) |

## 2. Architecture (compose)

- `postgres:17-bookworm` (volume `pgdata`, `pg_isready` healthcheck)
- `batch-api` (Ubuntu 24.04 runtime, non-root `app`, migrations auto-apply on boot,
  `APP_ENV=production` — refuses to boot without `DB_PASSWORD`/`JWT_SECRET`/`ALLOWED_ORIGINS`)
- `batch-portal` (nginx SPA; `/bff/*` + `/api/*` proxied to `batch-api:8101`, so no CORS in prod;
  QR `/?b=PE-2610-WL01` survives via `try_files` fallback)

## 3. CI/CD (`.github/workflows/ci.yml`)

`frontend` (node 22: typecheck + coverage) → `backend` (go 1.24 + Postgres 17 service) →
`e2e` (Playwright Chromium vs `bodyliabatch_test`) → `images` (build both Dockerfiles on `main`).
Deploy step is intentionally absent — add SSH/scp to your Ubuntu host after the dry-run passes.

## 4. Go-live checklist

- [ ] Dry-run script prints `DRY-RUN OK`
- [ ] DNS `batch.bodylia.in` → host; Let's Encrypt certs mounted at
  `/etc/letsencrypt/live/batch.bodylia.in/` (see `deploy/nginx-batch-bodylia.conf`)
- [ ] Prod `.env.deploy` from vault (never the example secrets)
- [ ] `docker compose up -d --build`, then re-run §1 smoke against `https://batch.bodylia.in`
- [ ] Rollback: previous images tagged per-SHA (`bodylia-batch-portal:<sha>`)
