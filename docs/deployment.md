# Production Deployment

This guide covers deploying playwright-cart to a production VPS using [Coolify](https://coolify.io) as the deployment platform. The example uses [Hetzner Cloud](https://www.hetzner.com/cloud) — any VPS provider running Ubuntu works the same way.

## Prerequisites

- A VPS running Ubuntu 24.04 (Hetzner CX22 or equivalent: 2 vCPU, 4 GB RAM)
- A domain name with DNS access
- An SSH key pair

## Architecture

```
Internet
    │ HTTPS (443)
    ▼
 Traefik  ◄── managed by Coolify, owns host ports 80 & 443
    │ internal Docker network, port 80
    ▼
  web (Nginx) ── /api/* ──────► server:3001
                └─ /api/events ─► server:3001 (SSE)
                └─ /reports/* ──► server:3001
                └─ /* ──────────► static SPA files
    │
    ▼
 server (Hono API) ──► PostgreSQL
                  └──► /mnt/data/reports (attachments + HTML reports)
```

Coolify manages Docker Engine and Traefik. Traefik routes your domain to the `web` container — no host port bindings are needed for the app containers. Persistent data (database + report files) lives on a mounted volume outside the containers.

---

## Step 1: Provision the Server

### Create the server

1. Go to [console.hetzner.cloud](https://console.hetzner.cloud) → **Create Server**
2. **Image:** Ubuntu 24.04
3. **Type:** CX22 (2 vCPU, 4 GB RAM, 40 GB SSD)
4. **SSH Keys:** add your public key
   ```bash
   # Generate one if needed
   ssh-keygen -t ed25519 -C "your@email.com"
   cat ~/.ssh/id_ed25519.pub
   ```
5. **Firewall:** create a firewall with these inbound rules:

   | Protocol | Port | Notes |
   |----------|------|-------|
   | TCP | 22 | SSH (optionally restrict to your IP) |
   | TCP | 80 | HTTP — required for Let's Encrypt |
   | TCP | 443 | HTTPS — app traffic |
   | TCP | 8000 | Coolify UI (optionally restrict to your IP) |

6. **Volume:** click **Add Volume** → size: 20 GB → name: `playwright-cart-data` → format: ext4 → auto-mount
7. Click **Create & Buy**

---

## Step 2: Mount the Volume

```bash
# SSH into the server
ssh root@<server-ip>

# Find the volume device path
ls -la /dev/disk/by-id/ | grep HC_Volume

# Create the mount point
mkdir -p /mnt/data

# Mount the volume
mount -o discard,defaults /dev/disk/by-id/scsi-0HC_Volume_<ID> /mnt/data

# Persist mount across reboots
echo "/dev/disk/by-id/scsi-0HC_Volume_<ID> /mnt/data ext4 discard,nofail,defaults 0 0" >> /etc/fstab

# Create subdirectories for app data
mkdir -p /mnt/data/db /mnt/data/reports

# Verify
df -h /mnt/data
```

Replace `<ID>` with the full numeric ID shown in the `ls` output. The `nofail` option prevents boot failure if the volume is temporarily detached.

---

## Step 3: Install Coolify

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

This installs Docker Engine and Coolify (~1–3 min). Once complete:

1. Open `http://<server-ip>:8000` in your browser **immediately**
2. Register your admin account on the first-visit screen — whoever registers first gets full control
3. Log in with your new credentials

---

## Step 4: Connect GitHub

In the Coolify UI:

1. **Settings → Source → Add a new Source → GitHub App**
2. Follow the OAuth flow to authorize Coolify on your repositories
3. Install the GitHub App on the `playwright-cart` repository

This enables Coolify to pull code and set up webhooks for automatic deployments on `git push`.

---

## Step 5: Deploy the Application

### Create the application in Coolify

1. **Projects → New Project** → name it `playwright-cart`
2. Inside the project → **New Resource → Application**
3. **Source:** select your GitHub source → pick the `playwright-cart` repo
4. **Branch:** `main`
5. **Build Pack:** change to **Docker Compose**
6. **Docker Compose Location:** `docker-compose.prod.yml`
7. **Base Directory:** `/`
8. Click **Save**

### Set environment variables

In the application's **Environment Variables** tab, add:

| Key | Value |
|-----|-------|
| `JWT_SECRET` | run `openssl rand -hex 32` and paste the output |
| `ADMIN_USERNAME` | your preferred admin username |
| `ADMIN_PASSWORD` | a strong password |

### Configure the domain

In the application's **Domains** tab:

1. Add your domain as `https://your-domain.example.com` — no port suffix
2. Assign it to the **`web` service only**; leave `server` and `postgres` blank
3. Ensure your DNS `A` record points to the server IP

Coolify provisions and renews Let's Encrypt SSL automatically via Traefik.

### Deploy

Click **Deploy**. Coolify will build the Docker images, start the containers, inject your environment variables, and configure Traefik routing. Subsequent deploys trigger automatically on every push to `main`.

### Production compose file

The `docker-compose.prod.yml` at the repo root is what Coolify uses. Key differences from the local `docker-compose.yml`:

| Concern | `docker-compose.yml` | `docker-compose.prod.yml` |
|---------|---------------------|--------------------------|
| Ports | `3001:3001`, `80:80` | None — Traefik routes internally |
| Volumes | Named Docker volumes | Bind mounts to `/mnt/data/` |
| Secrets | Defaults / `.env` | Injected by Coolify UI |
| `NODE_ENV` | unset | `production` |

<details>
<summary>View docker-compose.prod.yml</summary>

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: playwright_cart
      POSTGRES_PASSWORD: playwright_cart
      POSTGRES_DB: playwright_cart
    volumes:
      - /mnt/data/db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U playwright_cart"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  server:
    build:
      context: .
      dockerfile: packages/server/Dockerfile
    volumes:
      - /mnt/data/reports:/app/data
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      PORT: "3001"
      NODE_ENV: production
      DATA_DIR: /app/data
      DATABASE_URL: postgresql://playwright_cart:playwright_cart@postgres:5432/playwright_cart
      ADMIN_USERNAME: "${ADMIN_USERNAME}"
      ADMIN_PASSWORD: "${ADMIN_PASSWORD}"
      JWT_SECRET: "${JWT_SECRET}"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    depends_on:
      server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s
    restart: unless-stopped
```

</details>

---

## Step 6: Verify

```bash
curl https://your-domain.example.com/api/health
# Expected: {"status":"ok"}
```

Open your domain in a browser and log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set.

If you want AI summaries in production, configure the provider API key after login in **Settings -> AI Summaries**. No extra deploy-time environment variables are required beyond a strong `JWT_SECRET`.

---

## Maintenance

### Resize the data volume

No downtime required:

1. Hetzner Console → **Volumes** → `playwright-cart-data` → **Resize** → pick new size → confirm
2. SSH into the server and expand the filesystem:
   ```bash
   resize2fs /dev/disk/by-id/scsi-0HC_Volume_<ID>
   df -h /mnt/data
   ```

### Rebuild after code changes

Push to `main` — Coolify deploys automatically via webhook. To trigger manually, click **Deploy** in the Coolify UI.

---

## Configuration Notes

### Cloudflare DNS proxy

If you use Cloudflare as a DNS proxy (orange cloud), set SSL/TLS mode to **Full** under your domain's SSL/TLS settings:

- **Flexible** (default) — Cloudflare connects to the origin over HTTP. Traefik's redirect-to-HTTPS middleware then issues a 301, creating an infinite redirect loop.
- **Full** — Cloudflare connects over HTTPS and accepts the Let's Encrypt certificate. Use this.
- **Full (Strict)** — works once the cert is issued but may break on first deploy before the cert exists.

Let's Encrypt HTTP-01 validation works correctly with Cloudflare in proxy mode — Cloudflare forwards the `.well-known/acme-challenge/` request to the server, and Traefik handles it before any redirect fires.

### Nginx IPv4 and IPv6

The `web` container's `nginx.conf` listens on both IPv4 and IPv6:

```nginx
listen 80;        # IPv4
listen [::]:80;   # IPv6
```

This is required because Alpine Linux resolves `localhost` to `::1` (IPv6) in some Docker environments. Without the IPv6 listener, health checks using `http://localhost/` fail with "Connection refused" even though Nginx is running — causing Traefik to return `503`. The health check in `docker-compose.prod.yml` uses `http://127.0.0.1/` (explicit IPv4) to avoid this ambiguity.

---

## Troubleshooting

### 503 "no available server" from Traefik

Traefik v3 excludes containers from routing when Docker marks them unhealthy. Check container health first:

```bash
# Find container names
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'web|server'

# Check health status
docker inspect <web-container-name> --format '{{.State.Health.Status}}'

# View health check output
docker logs <web-container-name>

# Manually run the health check
docker exec <web-container-name> wget -qO- http://127.0.0.1/ 2>&1; echo "exit: $?"
```

Most common cause: Nginx health check uses `http://localhost/` but Alpine resolves `localhost` to `::1`. Fix: use `http://127.0.0.1/` in health checks and ensure `listen [::]:80;` is in `nginx.conf`.

### 404 after visiting your domain

Usually a Cloudflare SSL mode mismatch. Set SSL/TLS → **Full** (not Flexible). See [Configuration Notes](#cloudflare-dns-proxy) above.

### Let's Encrypt certificate not issuing

```bash
docker logs coolify-proxy --tail 30 | grep -E 'ACME|certificate|domain'
```

Common causes:
- `NXDOMAIN` — DNS A record missing or not yet propagated
- Typo in domain (e.g. a dot where a dash should be) — redeploy to clear stale Traefik router entries
- Hetzner firewall blocking port 80 — Let's Encrypt HTTP-01 requires inbound port 80

### Traefik can't reach the web container

Coolify's Traefik proxy is automatically added to each project's Docker network — you do not need to manually add services to the `coolify` network. To confirm:

```bash
docker inspect coolify-proxy --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
# Should include both `coolify` and the project network UUID
```
