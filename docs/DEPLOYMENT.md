# Deployment Guide — Manzil on a small VPS (tg4.small, 20GB SSD)

This describes the production setup for Manzil: no Docker on the server (it doesn't
buy anything on a 2 vCPU / 20GB box and just eats disk), no reverse-proxy magic beyond
Nginx, and deploys driven entirely by GitHub Actions over SSH. The server only ever
receives **compiled build output** — never the source tree, never `node_modules` from
CI (native Prisma binaries must match the server's OS anyway).

## Architecture

```
GitHub Actions (on push to main)
  ├─ test         → backend unit tests, typecheck
  ├─ build        → backend: tsc → dist/,  frontend: vite build → dist/
  └─ deploy       → rsync artifact to server, run scripts/remote-deploy.sh over SSH

Server (/opt/manzil)
  ├─ releases/<timestamp-sha>/
  │    ├─ backend/  (dist/, package.json, package-lock.json, prisma/)
  │    ├─ frontend/dist/
  │    └─ ops/, scripts/
  ├─ shared/
  │    ├─ backend/.env      ← persists across deploys, never overwritten
  │    └─ logs/
  └─ current → releases/<latest>   (symlink, flipped atomically on each deploy)

Nginx  → serves /opt/manzil/current/frontend/dist as static files
       → proxies /api to 127.0.0.1:5000
PM2    → runs /opt/manzil/current/backend/dist/app.js as `manzil-backend`
Postgres → runs natively on the same box (not containerized)
```

Only the last **3 releases** are kept on disk (older ones are pruned automatically
by the deploy script) — with `node_modules` reinstalled per release this is the main
thing worth watching on a 20GB disk.

---

## 1. One-time server setup

Assumes a fresh Ubuntu 22.04/24.04 box (adjust package manager commands if you're on
Debian). Run as a non-root sudo user, not root directly.

### 1.1 System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git rsync ufw nginx postgresql postgresql-contrib

# Node 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2, globally
sudo npm install -g pm2
```

### 1.2 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # 80 + 443
sudo ufw enable
```

Postgres should **not** be exposed publicly — it listens on `localhost` only by
default, leave it that way (check `postgresql.conf`'s `listen_addresses`, it should
be `localhost`, not `*`).

### 1.3 Deploy user & directory layout

Use a dedicated, low-privilege user for deploys (not root):

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG www-data deploy

sudo mkdir -p /opt/manzil/releases /opt/manzil/shared/backend /opt/manzil/shared/logs
sudo chown -R deploy:deploy /opt/manzil
```

Generate a deploy keypair (on your own machine, not the server) and add the
**public** key to the server:

```bash
ssh-keygen -t ed25519 -f manzil_deploy_key -C "manzil-deploy" -N ""
# copy manzil_deploy_key.pub content into:
sudo -u deploy mkdir -p /home/deploy/.ssh
echo "<contents of manzil_deploy_key.pub>" | sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Keep `manzil_deploy_key` (private) — it goes into GitHub Secrets, see §3. Never commit
it anywhere.

Let the `deploy` user reload PM2/Nginx without a password prompt for exactly the
commands it needs (nothing broader):

```bash
echo 'deploy ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx' | sudo tee /etc/sudoers.d/manzil-deploy
sudo visudo -c   # validate syntax
```

### 1.4 PM2 startup on boot

```bash
sudo -u deploy pm2 startup systemd -u deploy --hp /home/deploy
# run the printed `sudo env PATH=... pm2 startup systemd ...` command it gives you
```

(`pm2 save` happens automatically at the end of the first deploy — see
`scripts/remote-deploy.sh`.)

### 1.5 Postgres database

```bash
sudo -u postgres psql -c "CREATE USER manzil WITH PASSWORD 'CHANGE_ME_STRONG';"
sudo -u postgres psql -c "CREATE DATABASE manzil_db OWNER manzil;"
```

Pick a strong, generated password — this only needs to be typed once, into the
server's `.env` (§1.6), never into GitHub.

### 1.6 Backend `.env` (server-side secret, never in git, never in GitHub Secrets)

```bash
sudo -u deploy cp backend/.env.example /opt/manzil/shared/backend/.env
sudo -u deploy nano /opt/manzil/shared/backend/.env
```

Fill in for production:

```env
DATABASE_URL="postgresql://manzil:CHANGE_ME_STRONG@localhost:5432/manzil_db"
PORT=5000
NODE_ENV=production
JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<openssl rand -base64 48>
COOKIE_SECRET=<openssl rand -base64 48>
CLIENT_URL=https://your-domain.example
SEED_ADMIN_EMAIL=admin@your-domain.example
SEED_ADMIN_PASSWORD=<strong, unique password — change immediately after first login>
```

Generate secrets with `openssl rand -base64 48` (repeat per secret — don't reuse).
This file lives only on the server and is symlinked into every release by
`scripts/remote-deploy.sh`. **This is the design on purpose**: application secrets
(DB credentials, JWT signing keys) never pass through GitHub Actions at all — only
the SSH login itself does (§3). One less place secrets can leak from.

### 1.7 Nginx

```bash
sudo cp ops/nginx/manzil.conf /etc/nginx/sites-available/manzil
sudo sed -i 's/YOUR_DOMAIN_HERE/your-domain.example/' /etc/nginx/sites-available/manzil
sudo ln -s /etc/nginx/sites-available/manzil /etc/nginx/sites-enabled/manzil
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 1.8 HTTPS (Let's Encrypt / certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

Certbot edits `sites-available/manzil` in place to add the TLS server block and the
80→443 redirect, and sets up auto-renewal via a systemd timer — nothing further to
do. Confirm it's active with `sudo systemctl list-timers | grep certbot`.

---

## 2. First deploy (manual, before wiring up CI)

The very first release has to be placed on the server by hand once, because
`remote-deploy.sh` expects `/opt/manzil/releases/<id>` to already exist with a
release inside it — which is normally rsync'd there by the `deploy` GitHub Actions
job. Easiest path: just push to `main` once GitHub Secrets are configured (§3) and
let the pipeline do it — the pipeline *is* the "first deploy" mechanism, there's no
separate bootstrap script to run by hand beyond §1.

---

## 3. GitHub Actions configuration

### 3.1 Secrets

In the repo: **Settings → Environments → New environment → `production`**, then add
these environment secrets (scoping them to the `production` environment, rather than
repo-wide secrets, means you can require manual approval on deploys if you want —
Settings → Environments → production → "Required reviewers"):

| Secret | Value |
|---|---|
| `SSH_HOST` | Server IP or hostname |
| `SSH_USER` | `deploy` |
| `SSH_PORT` | `22` (or your custom SSH port) |
| `SSH_PRIVATE_KEY` | Contents of `manzil_deploy_key` (the private half generated in §1.3) |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -p <port> <host>` run from your own machine |

Get `SSH_KNOWN_HOSTS` with:

```bash
ssh-keyscan -p 22 your-server-ip-or-host
```

Paste the full output (all lines) as the secret value. This pins the host key so the
deploy step fails closed on a MITM instead of silently trusting whatever key shows up
(`StrictHostKeyChecking` is left at its default — the workflow does *not* disable it).

Notice **DATABASE_URL, JWT secrets, etc. are not GitHub Secrets** — they live only in
`/opt/manzil/shared/backend/.env` on the server (§1.6). GitHub Actions only ever gets
enough to SSH in; the app's own secrets never transit through CI.

### 3.2 What the pipelines do

- **`.github/workflows/ci.yml`** — runs on every PR and every push to a non-`main`
  branch: backend typecheck + Jest unit tests, frontend typecheck + Vitest + build,
  and a full Playwright e2e run (spins up its own throwaway Postgres via
  `e2e/docker-compose.yml`). Nothing here touches the server.

- **`.github/workflows/deploy.yml`** — runs on push to `main`:
  1. `test` — re-runs backend unit tests + typecheck as a hard gate.
  2. `build` — compiles backend (`tsc`) and frontend (`vite build`), assembles a
     release folder containing **only**: `backend/dist`, `backend/package.json`,
     `backend/package-lock.json`, `backend/prisma/` (schema + migrations, no
     generated client), `frontend/dist`, and the `ops/`/`scripts/` files needed to
     run the release. No source `.ts` files, no `node_modules`, no test files ship.
  3. `deploy` — uploads that release via `rsync` over SSH to
     `/opt/manzil/releases/<release_id>/`, then runs
     `scripts/remote-deploy.sh <release_id>` **on the server**, which:
     - symlinks in the persistent `.env`
     - `npm ci` (full install — Prisma's CLI is a devDependency and is needed once
       to generate the client with the right native binary for *this* host)
     - `prisma generate`
     - `prisma migrate deploy` (applies any new migrations; no-op if none)
     - `NODE_ENV=production node dist/seed.js` (compiled from `prisma/seed.ts` during
       the build step) — **idempotent**, safe to run on
       every deploy. In production this seeds only roles, permissions, and the one
       admin user (see §4) — it does not touch real client/case data at all.
     - `npm prune --omit=dev` to shrink `node_modules` back down
     - flips the `current` symlink to the new release (atomic cutover)
     - `pm2 reload` (zero-downtime) or `pm2 start` on first deploy
     - deletes releases older than the last 3
     - hits `/api/health` locally on the server and fails the deploy if it doesn't
       respond

If the health check fails, the workflow fails loudly — the `current` symlink has
already been flipped, though, so check `pm2 logs manzil-backend` on the server
immediately. To roll back, point `current` at the previous release directory by hand
and `pm2 reload`:

```bash
ls -1t /opt/manzil/releases          # find the previous good release id
ln -sfn /opt/manzil/releases/<previous-id> /opt/manzil/current
pm2 reload /opt/manzil/current/ops/ecosystem.config.js --update-env
```

---

## 4. Seed data policy

`backend/prisma/seed.ts` is split by `NODE_ENV`:

- **Always seeded** (any environment): all permissions, all system roles
  (`SUPER_ADMIN`, `ADMIN`, `HR_MANAGER`, `APPOINTMENT_TEAM`, `FILE_TEAM`,
  `ACCOUNTANT`, `MANAGER`, `USER`), and exactly **one** admin user, assigned
  `SUPER_ADMIN`. Everything uses `upsert`, so re-running it is a no-op if nothing
  changed and safe to run on every deploy.
- **Only outside production** (`NODE_ENV !== 'production'`): four extra demo team
  users (`manager@…`, `appointment@…`, `files@…`, `accounts@…`) for local
  development and the e2e suite. These never reach a production database.

The admin's email/password come from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in
the server's `.env` (§1.6) — set a real, unique, strong password there before the
first deploy. If left unset, the seed falls back to the published default
(`admin@manzil.com` / `Admin@123456`) and prints a loud warning to the deploy log;
change it via the app immediately if that ever happens.

No client, case, invoice, or other business data is ever created by the seed — that
data only ever comes from real usage or the Excel import feature.

---

## 5. Preventing duplicate clients on import

Two changes work together:

1. **Database-level constraint**: `Client.passportNumber` is `@unique` in
   `prisma/schema.prisma` (nullable-safe — Postgres allows any number of `NULL`
   passport numbers, it only rejects a second row with the *same non-null* value).
   This is the backstop against races or any future code path that bypasses the
   application check.
2. **Application-level check** (`backend/src/services/client.service.ts`,
   `bulkImportClients`): before inserting each row, it's checked against both the
   database and the rest of the current batch —
   - if the row has a passport number, duplicate = another client with the same
     passport number already exists;
   - if it doesn't (early-intake rows are allowed to be incomplete), duplicate =
     another client with the same first name + last name + phone already exists.

   Matches are skipped, not imported, and reported back distinctly
   (`result.duplicates`) alongside genuine validation failures (`result.failed`),
   so the import UI can tell the two apart. A same-request race that still slips
   past the pre-check gets caught by the DB constraint and reported as a duplicate
   too (Prisma error code `P2002`).

The single-client create/update endpoints (`POST /api/clients`,
`PUT /api/clients/:id`) also translate a `P2002` conflict into a clean
`409 A client with this passport number already exists` instead of a raw 500.

---

## 6. Disk-space housekeeping on a 20GB box

- Only 3 releases are ever kept (`scripts/remote-deploy.sh`); each has its own
  `node_modules`, so this is the main thing to watch. Reduce `KEEP_RELEASES` in
  that script if you're tight.
- `backend/logs/*.log` (Winston) and PM2's own logs under
  `/opt/manzil/shared/logs/` will grow unbounded by default — set up logrotate:

  ```
  # /etc/logrotate.d/manzil
  /opt/manzil/shared/logs/*.log {
      daily
      rotate 14
      compress
      missingok
      notifempty
      copytruncate
  }
  ```

- Postgres: enable regular `VACUUM` (autovacuum is on by default, leave it on) and
  take periodic `pg_dump` backups to off-box storage (S3, Backblaze, etc.) — a
  single-disk VPS is not a backup strategy. A simple cron:

  ```bash
  0 3 * * * pg_dump -U manzil manzil_db | gzip > /opt/manzil/shared/backups/db-$(date +\%F).sql.gz
  0 4 * * * find /opt/manzil/shared/backups -mtime +7 -delete
  ```

  (ship `db-*.sql.gz` off-box with whatever tool you already use — rclone, restic,
  etc. — this repo doesn't prescribe one.)

---

## 7. Day-to-day operations

```bash
pm2 status                       # is manzil-backend up?
pm2 logs manzil-backend          # tail logs
pm2 monit                        # live CPU/mem
sudo systemctl status nginx
sudo nginx -t                    # validate config after manual edits
sudo -u postgres psql manzil_db  # DB shell
```

To force a redeploy without a new commit: **Actions → Deploy → Run workflow**
(`workflow_dispatch` is enabled on `deploy.yml`).
