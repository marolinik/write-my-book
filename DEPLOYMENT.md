# Write My Book OK -- Production Deployment Guide

This guide walks you through deploying Write My Book OK (WMB) to production. It covers every service, every environment variable, and every external account you need. You do not need prior DevOps experience to follow it -- just a terminal and about an hour.

---

## Quick Start (TL;DR)

For experienced deployers who know Docker and just need the steps:

```bash
git clone <your-repo-url> && cd platform-new
cp .env.docker .env.docker.local          # copy the template
# Fill in ALL values in .env.docker.local (Clerk, Stripe, Anthropic, encryption secret, etc.)
# Set NEXT_PUBLIC_* build args in your shell or .env file:
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
export NEXT_PUBLIC_APP_URL=https://yourdomain.com
docker compose --env-file .env.docker.local build
docker compose --env-file .env.docker.local up -d
docker compose exec app npx prisma db push
curl https://yourdomain.com/api/health    # expect {"status":"ok","timestamp":"..."}
```

> **Warning:** `NEXT_PUBLIC_*` variables must be set at **build time**. They are baked into the JavaScript bundle and cannot be changed at runtime. If you change them, you must rebuild the image.

> **Note (env file):** `.env.docker` is **not tracked in git** — it holds live credentials. Create it locally from `.env.example`. Never re-add a `.gitignore` exception for it.

> **Note (free local model):** the LAN-vLLM stack (`local-llm-proxy` + `WMB_LLM_FORCE_LOCAL`) lives in an opt-in overlay and is NEVER part of production:
> ```bash
> # local zero-cost testing only:
> docker compose -f docker-compose.yml -f docker-compose.local-llm.yml --env-file .env.docker.local up -d
> ```
> Production uses `-f docker-compose.yml -f docker-compose.prod.yml`, which contains no reference to the local proxy.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clerk Setup (Authentication)](#2-clerk-setup-authentication)
3. [Stripe Setup (Billing)](#3-stripe-setup-billing)
4. [Sentry Setup (Error Tracking)](#4-sentry-setup-error-tracking)
5. [Environment Variables](#5-environment-variables)
6. [Service Dependencies](#6-service-dependencies)
7. [Deployment](#7-deployment)
8. [First-Run Initialization](#8-first-run-initialization)
9. [Verification Checklist](#9-verification-checklist)
10. [Maintenance](#10-maintenance)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

Before you begin, make sure you have the following:

- [ ] **Docker** installed on your server. Docker packages the app and all its databases into containers that run anywhere. If you do not have Docker yet, install it from the official site: [https://docs.docker.com/get-docker/](https://docs.docker.com/get-docker/). You need both Docker Engine and Docker Compose (included in Docker Desktop).

- [ ] **A server or VPS** with at least 4 GB of RAM and 20 GB of disk space. Any cloud provider works: DigitalOcean, AWS, Hetzner, Linode, etc.

- [ ] **A domain name** (optional but recommended). For example, `app.yourdomain.com`. If you do not have one, you can use the server's IP address, but HTTPS and webhooks will not work without a domain.

- [ ] **A terminal** (command line). On Windows, use PowerShell or WSL. On Mac/Linux, use Terminal.

### What is Docker?

Docker runs your app inside isolated "containers" -- lightweight virtual environments that include everything the app needs (code, database, file storage). You describe what you want in a `docker-compose.yml` file, and Docker handles the rest. You do not need to install PostgreSQL, Redis, or any other service manually.

### What is a .env file?

A `.env` file is a plain text file that stores configuration values (passwords, API keys, URLs). Each line has a name and a value separated by `=`. The app reads these values when it starts. You never commit `.env` files to version control because they contain secrets.

---

## 2. Clerk Setup (Authentication)

Clerk handles user sign-up, sign-in, and session management. You need a Clerk account before deploying.

### Create a Clerk Application

- [ ] Go to [https://dashboard.clerk.com](https://dashboard.clerk.com) and create an account (or sign in).
- [ ] Click **Create application**.
- [ ] Give it a name (e.g., "Write My Book OK").
- [ ] Under sign-in methods, enable **Email** (and optionally Google, GitHub, etc.).
- [ ] Click **Create**.

### Get Your API Keys

- [ ] In the Clerk dashboard, go to **Configure** in the left sidebar, then click **API Keys**.
- [ ] Copy the **Publishable Key** -- it starts with `pk_live_` (or `pk_test_` for testing). This goes in `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- [ ] Copy the **Secret Key** -- it starts with `sk_live_` (or `sk_test_`). This goes in `CLERK_SECRET_KEY`.

### Configure the Webhook

WMB needs to know when users sign up, update their profile, or delete their account. Clerk sends these notifications via a "webhook" -- an automatic HTTP request to your server.

- [ ] In the Clerk dashboard, go to **Configure** > **Webhooks**.
- [ ] Click **Add Endpoint**.
- [ ] Enter your webhook URL:
  ```
  https://yourdomain.com/api/auth/webhook
  ```
  Replace `yourdomain.com` with your actual domain.
- [ ] Under **Events to send**, select:
  - `user.created`
  - `user.updated`
  - `user.deleted`
- [ ] Click **Create**.
- [ ] Copy the **Signing Secret** -- it starts with `whsec_`. This goes in `CLERK_WEBHOOK_SECRET`.

> **Tip:** The signing secret is used to verify that webhook requests actually come from Clerk and have not been tampered with.

### Clerk Environment Variables Summary

| Variable | Example Value | Where to Find |
|----------|---------------|---------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_abc123...` | Dashboard > Configure > API Keys |
| `CLERK_SECRET_KEY` | `sk_live_xyz789...` | Dashboard > Configure > API Keys |
| `CLERK_WEBHOOK_SECRET` | `whsec_abc123...` | Dashboard > Configure > Webhooks > your endpoint |

> **Warning:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is a build-time variable. It must be set when you build the Docker image, not just at runtime. See the [Deployment](#7-deployment) section.

---

## 3. Stripe Setup (Billing)

Stripe handles subscription billing. This is **optional** -- if you skip it, all users will be on the Free plan (1 book, BYOK only). You can add Stripe later without any code changes.

### Get Your API Keys

- [ ] Go to [https://dashboard.stripe.com](https://dashboard.stripe.com) and create an account (or sign in).
- [ ] In the left sidebar, click **Developers**, then click **API Keys**.
- [ ] Copy the **Secret key** -- it starts with `sk_live_`. This goes in `STRIPE_SECRET_KEY`.

> **Tip:** Stripe has "Test mode" and "Live mode." Use Test mode first to verify everything works, then switch to Live mode for real payments. The keys are different for each mode.

### Create Your Products

WMB has 4 billing tiers. The Free tier needs no Stripe product (it is the default). You need to create 3 paid products:

- [ ] In the Stripe dashboard, go to **Product catalog** (left sidebar), then click **Add product**.

**Product 1: Starter**
- [ ] Name: `Starter`
- [ ] Price: `$9.00` per month (recurring)
- [ ] Click **Save product**
- [ ] On the product page, find the **Price** section. Copy the Price ID -- it starts with `price_`. This goes in `STRIPE_STARTER_PRICE_ID`.

**Product 2: Pro**
- [ ] Name: `Pro`
- [ ] Price: `$29.00` per month (recurring)
- [ ] Click **Save product**
- [ ] Copy the Price ID (`price_...`). This goes in `STRIPE_PRO_PRICE_ID`.

**Product 3: Enterprise**
- [ ] Name: `Enterprise`
- [ ] Price: `$99.00` per month (recurring)
- [ ] Click **Save product**
- [ ] Copy the Price ID (`price_...`). This goes in `STRIPE_ENTERPRISE_PRICE_ID`.

### Create the Webhook

WMB needs to know when a checkout completes, a subscription changes, or a subscription is canceled.

- [ ] In the Stripe dashboard, go to **Developers** > **Webhooks**.
- [ ] Click **Add endpoint**.
- [ ] Enter your webhook URL:
  ```
  https://yourdomain.com/api/billing/webhook
  ```
- [ ] Under **Events to send**, select exactly these 3 events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- [ ] Click **Add endpoint**.
- [ ] Copy the **Signing secret** -- it starts with `whsec_`. This goes in `STRIPE_WEBHOOK_SECRET`.

### Stripe Plan Summary

| Plan | Price | Env Var for Price ID | Features |
|------|-------|---------------------|----------|
| Free | $0/mo | *(none needed)* | 1 book, BYOK only, basic export |
| Starter | $9/mo | `STRIPE_STARTER_PRICE_ID` | 5 books, all exports, beta reader lab |
| Pro | $29/mo | `STRIPE_PRO_PRICE_ID` | Unlimited books, series manager, priority support |
| Enterprise | $99/mo | `STRIPE_ENTERPRISE_PRICE_ID` | Unlimited books, team collaboration, dedicated support |

### Stripe Environment Variables Summary

| Variable | Example Value | Where to Find |
|----------|---------------|---------------|
| `STRIPE_SECRET_KEY` | `sk_live_xyz789...` | Developers > API Keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_abc123...` | Developers > Webhooks > your endpoint |
| `STRIPE_STARTER_PRICE_ID` | `price_1ABC...` | Product catalog > Starter > Price section |
| `STRIPE_PRO_PRICE_ID` | `price_2DEF...` | Product catalog > Pro > Price section |
| `STRIPE_ENTERPRISE_PRICE_ID` | `price_3GHI...` | Product catalog > Enterprise > Price section |

> **Tip:** If checkout completes but the user's plan stays on Free, the most common cause is a misconfigured webhook. Double-check the URL and the 3 event types.

---

## 4. Sentry Setup (Error Tracking)

Sentry captures errors and performance issues in production. This is **optional** -- if you skip it, error tracking is simply disabled. You can add Sentry later without any code changes.

> **Tip:** Sentry only activates when `NODE_ENV=production` **and** `NEXT_PUBLIC_SENTRY_DSN` is set. In development, it does nothing.

### Create a Sentry Project

- [ ] Go to [https://sentry.io](https://sentry.io) and create an account (or sign in).
- [ ] Create a new project:
  - Platform: **Next.js**
  - Give it a name (e.g., "wmb-production")
- [ ] Note your **organization slug** -- this is the URL-friendly name shown in your Sentry URL (e.g., `https://your-org.sentry.io`). The slug is the `your-org` part. This goes in `SENTRY_ORG`.
- [ ] Note your **project slug** -- the URL-friendly name of the project you just created (e.g., `wmb-production`). This goes in `SENTRY_PROJECT`.

### Get Your DSN

- [ ] In the Sentry dashboard, go to **Settings** > **Projects** > select your project > **Client Keys (DSN)**.
- [ ] Copy the full DSN URL. It looks like:
  ```
  https://abc123@o123456.ingest.sentry.io/1234567
  ```
  This goes in `NEXT_PUBLIC_SENTRY_DSN`.

### Sentry Environment Variables Summary

| Variable | Example Value | Where to Find |
|----------|---------------|---------------|
| `NEXT_PUBLIC_SENTRY_DSN` | `https://abc@o123.ingest.sentry.io/456` | Settings > Projects > Client Keys |
| `SENTRY_ORG` | `your-org` | Your Sentry URL slug |
| `SENTRY_PROJECT` | `wmb-production` | The project name you created |

> **Tip:** If errors do not appear in Sentry after deploying, verify that `NODE_ENV=production` is set in your deployment environment. The Docker image sets this automatically.

---

## 5. Environment Variables

This section is the complete reference for every environment variable WMB uses. The `.env.docker` template file in the repository contains all of these with placeholder values.

> **Warning: Build-Time Variables.** Variables starting with `NEXT_PUBLIC_` are embedded into the JavaScript bundle at **build time**. They cannot be changed by setting them at runtime. If you need to change any `NEXT_PUBLIC_*` variable, you must **rebuild the Docker image**. This is a Next.js framework requirement, not something specific to WMB.

> **Warning: Encryption Secret.** `API_KEY_ENCRYPTION_SECRET` encrypts user API keys stored in the database. Generate it once with `openssl rand -hex 32` and **never change it**. If you lose or change this value, all encrypted user API keys become permanently unrecoverable. Users would need to re-enter their keys.

> **Warning: Security Variables.** `DEV_AUTH_BYPASS` **must** be an empty string (`DEV_AUTH_BYPASS=`) in production. If set to `"true"`, **anyone can access the app without authentication**. `E2E_TEST_SECRET` must also be empty in production.

### Required Variables

These variables are required for the app to function. The app will not start or will malfunction without them.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(set by Compose)* | PostgreSQL connection string. Format: `postgresql://USER:PASS@HOST:5432/writemybook?schema=public` |
| `REDIS_URL` | *(set by Compose)* | Redis connection string. Format: `redis://:PASSWORD@HOST:PORT` |
| `S3_ENDPOINT` | *(set by Compose)* | MinIO/S3 endpoint URL (e.g., `http://minio:9000`) |
| `S3_ACCESS_KEY_ID` | *(set by Compose)* | MinIO/S3 access key |
| `S3_SECRET_ACCESS_KEY` | *(set by Compose)* | MinIO/S3 secret key |
| `S3_BUCKET` | `wmb-projects` | S3 bucket name for file storage |
| `S3_FORCE_PATH_STYLE` | `true` | Required for MinIO; set to `false` for AWS S3 |
| `S3_REGION` | `us-east-1` | S3 region (any value works for MinIO) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | -- | Clerk publishable key (`pk_live_...`). **Build-time.** |
| `CLERK_SECRET_KEY` | -- | Clerk secret key (`sk_live_...`) |
| `CLERK_WEBHOOK_SECRET` | -- | Clerk webhook signing secret (`whsec_...`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` | Sign-in page path. **Build-time.** |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/signup` | Sign-up page path. **Build-time.** |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Your production URL (e.g., `https://yourdomain.com`). **Build-time.** |
| `API_KEY_ENCRYPTION_SECRET` | -- | 64-char hex string. Generate: `openssl rand -hex 32` |
| `NEO4J_URI` | *(set by Compose)* | Neo4j connection URI (e.g., `bolt://neo4j:7687`) |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | *(set by Compose)* | Neo4j password |
| `QDRANT_URL` | *(set by Compose)* | Qdrant REST API URL (e.g., `http://qdrant:6333`) |
| `QDRANT_API_KEY` | *(set by Compose)* | Qdrant API key for authentication |
| `ANTHROPIC_API_KEY` | -- | Anthropic API key (`sk-ant-...`). Required for AI agent workflows. |

### Optional Variables

These enable additional features. The app works without them, but the corresponding features will be disabled.

| Variable | Default | Description |
|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | *(empty)* | Stripe secret key. Without it, billing is disabled (all users get Free plan). |
| `STRIPE_WEBHOOK_SECRET` | *(empty)* | Stripe webhook signing secret. |
| `STRIPE_STARTER_PRICE_ID` | *(empty)* | Stripe Price ID for Starter plan ($9/mo). |
| `STRIPE_PRO_PRICE_ID` | *(empty)* | Stripe Price ID for Pro plan ($29/mo). |
| `STRIPE_ENTERPRISE_PRICE_ID` | *(empty)* | Stripe Price ID for Enterprise plan ($99/mo). |
| `NEXT_PUBLIC_SENTRY_DSN` | *(empty)* | Sentry DSN. Without it, error tracking is disabled. **Build-time.** |
| `SENTRY_ORG` | *(empty)* | Sentry organization slug (for source maps upload). |
| `SENTRY_PROJECT` | *(empty)* | Sentry project slug. |
| `OPENROUTER_API_KEY` | *(empty)* | OpenRouter API key. Enables alternative LLM provider. |
| `OPENAI_API_KEY` | *(empty)* | OpenAI API key. Enables vector embeddings for semantic search. |
| `SERPER_API_KEY` | *(empty)* | Serper API key. Enables Google-quality web search for agents. |

### Security-Critical Variables

These **must** be empty strings in production. They exist for local development only.

| Variable | Production Value | What Happens If Set |
|----------|-----------------|-------------------- |
| `DEV_AUTH_BYPASS` | *(empty)* | If `"true"`, **anyone can access the app without authentication**. |
| `E2E_TEST_SECRET` | *(empty)* | If set, enables test-only API routes that bypass normal validation. |
| `DEV_AUTH_USER_NAME` | *(empty)* | Used only when `DEV_AUTH_BYPASS=true`. Has no effect when bypass is empty. |
| `DEV_CLERK_ID` | *(empty)* | Used only when `DEV_AUTH_BYPASS=true`. Has no effect when bypass is empty. |

### Docker Compose Auto-Set Variables

When using Docker Compose, these variables are **automatically set** in the `environment` block of `docker-compose.yml`. **Do not** put them in `.env.docker` -- they will conflict with the Compose-managed values.

| Variable | Set To |
|----------|--------|
| `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/writemybook?schema=public` |
| `REDIS_URL` | `redis://:wmb-redis-prod@redis:6379` |
| `S3_ENDPOINT` | `http://minio:9000` |
| `S3_ACCESS_KEY_ID` | Value of `MINIO_ROOT_USER` (default: `wmb-minio`) |
| `S3_SECRET_ACCESS_KEY` | Value of `MINIO_ROOT_PASSWORD` (default: `wmb-minio-prod`) |
| `S3_BUCKET` | `wmb-projects` |
| `S3_FORCE_PATH_STYLE` | `true` |
| `NEO4J_URI` | `bolt://neo4j:7687` |
| `NEO4J_USER` | `neo4j` |
| `NEO4J_PASSWORD` | `wmb-neo4j-dev` |
| `QDRANT_URL` | `http://qdrant:6333` |
| `QDRANT_API_KEY` | Value of `QDRANT_API_KEY` (default: `wmb-qdrant-prod`) |

### Docker Service Credentials

The Docker Compose infrastructure services use default credentials that you can override. To change them, uncomment and edit the corresponding lines in `.env.docker`:

```bash
# Uncomment and change these to use custom credentials:
# REDIS_PASSWORD=your-strong-redis-password
# MINIO_ROOT_USER=your-minio-user
# MINIO_ROOT_PASSWORD=your-strong-minio-password
# QDRANT_API_KEY=your-strong-qdrant-key
```

> **Tip:** For production, you should change these defaults. The Compose file reads them and passes them to both the service containers and the app container automatically.

---

## 6. Service Dependencies

WMB uses 5 infrastructure services plus the app itself. When using Docker Compose, all services are managed for you. This section explains what each one does and how to use managed alternatives if you prefer.

### PostgreSQL 16 (Primary Database)

**What it does:** Stores all application data -- users, books, chapters, findings, sessions, subscriptions, everything.

**Connection string format:**
```
postgresql://USER:PASSWORD@HOST:5432/writemybook?schema=public
```

**Docker Compose:** Runs `postgres:16-alpine` on port 5432 with a persistent volume.

> **Tip:** You can use a managed PostgreSQL service instead (AWS RDS, Supabase, Neon, DigitalOcean Managed Databases). Set `DATABASE_URL` in `.env.docker` to your managed database URL and remove the `postgres` service from `docker-compose.yml`.

### Redis 7 (Caching)

**What it does:** Caches frequently accessed data and manages rate limiting for API routes.

**Connection string format:**
```
redis://:PASSWORD@HOST:6379
```

**Docker Compose:** Runs `redis:7-alpine` on port 6379 with password authentication.

> **Tip:** You can use a managed Redis service instead (AWS ElastiCache, Upstash, Redis Cloud). Update `REDIS_URL` accordingly.

### MinIO (S3-Compatible File Storage)

**What it does:** Stores uploaded manuscripts, generated documents (story bibles, architecture reports, etc.), and exported files (EPUB, PDF, DOCX).

**Docker Compose:** Runs `minio/minio:latest` on ports 9000 (API) and 9001 (web console). A helper container (`minio-init`) automatically creates the `wmb-projects` bucket on first startup.

> **Tip:** You can use AWS S3, Cloudflare R2, or any S3-compatible service instead. Update `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and set `S3_FORCE_PATH_STYLE=false` for AWS S3.

### Neo4j 5 (Knowledge Graph)

**What it does:** Stores relationships between story elements -- characters, locations, plot threads, timeline events. Powers the wiki and continuity-checking features.

**Connection string format:**
```
bolt://HOST:7687
```

**Docker Compose:** Runs `neo4j:5-community` on ports 7474 (web console) and 7687 (Bolt protocol).

> **Tip:** You can use Neo4j Aura (cloud) instead. Update `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD`.

### Qdrant v1.13.2 (Vector Search)

**What it does:** Stores vector embeddings of chapter content for semantic search and memory retrieval. Agents use this to find contextually relevant passages across the entire manuscript.

**Docker Compose:** Runs `qdrant/qdrant:v1.13.2` on ports 6333 (REST API) and 6334 (gRPC).

> **Tip:** You can use Qdrant Cloud instead. Update `QDRANT_URL` and `QDRANT_API_KEY`.

### Export Templates

The `export-templates/` directory contains Pandoc Lua filters, CSS, and Typst templates used by the manuscript export pipeline (EPUB, PDF, DOCX). These are copied into the Docker image at build time.

| File | Purpose |
|------|---------|
| `draft-watermark.lua` | Adds "DRAFT" watermark to PDF exports |
| `epigraph.lua` | Formats chapter epigraphs |
| `first-para.lua` | Styles the first paragraph of each chapter (drop cap / small caps) |
| `pagebreak.lua` | Inserts page breaks between chapters |
| `recto-start.lua` | Forces chapters to start on right-hand (recto) pages in PDF |
| `scene-break.lua` | Formats scene break markers (e.g., `***` -> centered ornament) |
| `special-format.lua` | Handles special formatting (letters, documents within the story) |
| `epub-genre.css` | Genre-specific CSS for EPUB exports |
| `typst-book.typ` | Typst template for PDF book layout |

These files do not need configuration. They are included automatically in the Docker image via the `COPY --from=builder /app/export-templates ./export-templates` instruction in the Dockerfile.

---

## 7. Deployment

### Option A: Docker Compose (Recommended)

This is the simplest approach. Docker Compose starts all 6 services (PostgreSQL, Redis, MinIO, Neo4j, Qdrant, and the app) with a single command.

#### Step 1: Prepare Your Environment File

- [ ] Copy the template:
  ```bash
  cp .env.docker .env.docker.local
  ```
- [ ] Open `.env.docker.local` in a text editor and fill in all values from the previous sections:
  - Clerk keys (Section 2)
  - Stripe keys and price IDs (Section 3, if using billing)
  - Sentry DSN (Section 4, if using error tracking)
  - Anthropic API key
  - Encryption secret (generate with `openssl rand -hex 32`)
  - Any optional API keys (OpenRouter, OpenAI, Serper)
- [ ] Verify security variables are safe:
  ```
  DEV_AUTH_BYPASS=
  E2E_TEST_SECRET=
  ```
  Both must be empty (no value after the `=` sign).

#### Step 2: Set Build-Time Variables

`NEXT_PUBLIC_*` variables must be available when Docker builds the image. The `docker-compose.yml` passes them as build arguments automatically, reading them from your `.env.docker.local` file.

Make sure these are set in `.env.docker.local`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_your_actual_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

If you are also using Sentry, add:
```
NEXT_PUBLIC_SENTRY_DSN=https://abc@o123.ingest.sentry.io/456
```

#### Step 3: Build the Image

```bash
docker compose --env-file .env.docker.local build
```

This builds the Next.js app with all `NEXT_PUBLIC_*` values baked in. It takes a few minutes on the first run.

#### Step 4: Start All Services

```bash
docker compose --env-file .env.docker.local up -d
```

This starts all 6 services in the background. The app waits for all databases to be healthy before starting.

- [ ] Verify all services are running:
  ```bash
  docker compose ps
  ```
  All services should show `Up` or `Up (healthy)`.

#### Step 5: Initialize the Database

See [First-Run Initialization](#8-first-run-initialization).

### Option B: Standalone Docker (Without Compose)

If you are using managed database services (e.g., AWS RDS, Redis Cloud, etc.) and only need to run the app container:

#### Build the Image

```bash
docker build \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_... \
  --build-arg NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login \
  --build-arg NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup \
  --build-arg NEXT_PUBLIC_APP_URL=https://yourdomain.com \
  -t wmb-app .
```

> **Tip:** If using Sentry, add `--build-arg NEXT_PUBLIC_SENTRY_DSN=https://your-dsn` to the build command.

#### Run the Container

```bash
docker run -d \
  --name wmb-app \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@your-db-host:5432/writemybook?schema=public" \
  -e REDIS_URL="redis://:password@your-redis-host:6379" \
  -e S3_ENDPOINT="https://your-s3-endpoint" \
  -e S3_ACCESS_KEY_ID="your-key" \
  -e S3_SECRET_ACCESS_KEY="your-secret" \
  -e S3_BUCKET="wmb-projects" \
  -e S3_FORCE_PATH_STYLE="false" \
  -e NEO4J_URI="bolt://your-neo4j-host:7687" \
  -e NEO4J_USER="neo4j" \
  -e NEO4J_PASSWORD="your-password" \
  -e QDRANT_URL="http://your-qdrant-host:6333" \
  -e QDRANT_API_KEY="your-key" \
  -e CLERK_SECRET_KEY="sk_live_..." \
  -e CLERK_WEBHOOK_SECRET="whsec_..." \
  -e API_KEY_ENCRYPTION_SECRET="your-64-char-hex-string" \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e DEV_AUTH_BYPASS="" \
  -e E2E_TEST_SECRET="" \
  wmb-app
```

### SSL/HTTPS

The WMB app serves HTTP on port 3000. For production, you need a reverse proxy that handles HTTPS (SSL termination) and forwards traffic to the app.

**Option 1: Caddy (simplest)**

Caddy automatically obtains and renews Let's Encrypt certificates. Add a `Caddyfile`:
```
yourdomain.com {
    reverse_proxy localhost:3000
}
```
See: [https://caddyserver.com/docs/quick-starts/reverse-proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy)

**Option 2: Nginx + Certbot**

See: [https://certbot.eff.org/instructions](https://certbot.eff.org/instructions)

**Option 3: Cloud Load Balancer**

Most cloud providers (AWS ALB, DigitalOcean Load Balancer, Cloudflare) offer SSL termination at the load balancer level. Configure the load balancer to forward HTTPS traffic to your server's port 3000.

### DNS Configuration

- [ ] Create an **A record** pointing your domain to your server's IP address.
- [ ] (Optional) Create a **CNAME record** for `www` pointing to your domain.

> **Tip:** DNS changes can take up to 48 hours to propagate, though usually it is much faster (minutes to a few hours).

---

## 8. First-Run Initialization

After all containers are running, you need to set up the database schema and verify external integrations.

### Initialize the Database

- [ ] Push the Prisma schema to create all database tables:
  ```bash
  docker compose exec app npx prisma db push
  ```

> **Warning:** WMB uses `prisma db push` instead of `prisma migrate deploy`. This is intentional -- the migration history has known drift, and `db push` synchronizes the schema directly. It is safe for initial setup and for schema updates.

### Verify Clerk Webhook

- [ ] Open your app in a browser and create a test account (sign up).
- [ ] Check that the user appears in your database:
  ```bash
  docker compose exec postgres psql -U postgres -d writemybook -c "SELECT id, email FROM \"User\" LIMIT 5;"
  ```
  You should see your test user.
- [ ] In the Clerk dashboard, go to **Webhooks** > your endpoint > **Logs**. You should see delivered events for `user.created`.

### MinIO Bucket

- [ ] **Docker Compose:** The `minio-init` service automatically creates the `wmb-projects` bucket on first startup. No action needed.
- [ ] **Standalone (without Compose):** If using MinIO separately, create the bucket manually:
  ```bash
  mc alias set wmb http://your-minio-host:9000 YOUR_ACCESS_KEY YOUR_SECRET_KEY
  mc mb --ignore-existing wmb/wmb-projects
  ```

### Qdrant Collections

No manual setup needed. Qdrant collections are created automatically the first time the app indexes content.

### Neo4j Schema

No manual setup needed. Neo4j constraints and indexes are created automatically on first use.

---

## 9. Verification Checklist

After deployment and initialization, verify everything works by going through this checklist:

### Core Application

- [ ] **Health check:** Run `curl https://yourdomain.com/api/health` -- you should get:
  ```json
  {"status":"ok","timestamp":"2026-02-28T12:00:00.000Z"}
  ```

- [ ] **Authentication:** Visit `https://yourdomain.com/login` -- the Clerk sign-in page should render.

- [ ] **User creation:** Create an account through the sign-up page. Your user record should appear in the database.

- [ ] **Webhook delivery:** In the Clerk dashboard, go to Webhooks > your endpoint > Logs. Events should show as "delivered" (green).

- [ ] **Create a book:** After signing in, navigate to the dashboard and create a new book. It should appear in your book list.

### Billing (if Stripe is configured)

- [ ] **Upgrade flow:** Click an upgrade button in the app. You should be redirected to a Stripe checkout page.

- [ ] **Subscription update:** Complete a test payment using Stripe's test card (`4242 4242 4242 4242`). The user's plan should update from Free to the selected tier.

### Error Tracking (if Sentry is configured)

- [ ] **Error capture:** Trigger a client-side error (e.g., visit a nonexistent page that causes a render error). The event should appear in your Sentry dashboard within a few minutes.

### File Storage

- [ ] **Document upload:** Upload a document (manuscript import) through the UI. The file should be stored in MinIO and accessible from the app.

### AI Agent Workflows

- [ ] **Agent interaction:** Open a book, navigate to the agent panel, and start a workflow (e.g., "Build Story Bible"). The agent should respond and produce output.

> **Tip:** Agent workflows require a valid `ANTHROPIC_API_KEY`. If the agent fails immediately, check that your API key is correct and has available credits.

---

## 10. Maintenance

### Database Backups

Back up your PostgreSQL database regularly. A daily backup is recommended.

```bash
# Create a backup
docker compose exec postgres pg_dump -U postgres writemybook > backup-$(date +%Y%m%d).sql

# Restore from a backup
docker compose exec -T postgres psql -U postgres writemybook < backup-20260228.sql
```

> **Tip:** For managed databases (AWS RDS, Supabase, etc.), use their built-in backup features instead.

### Updating the Application

When a new version is available:

```bash
# Pull the latest code
git pull

# Rebuild the image (remember: NEXT_PUBLIC_* vars are needed at build time)
docker compose --env-file .env.docker.local build

# Restart with the new image
docker compose --env-file .env.docker.local up -d

# Apply any database schema changes
docker compose exec app npx prisma db push
```

### Viewing Logs

```bash
# View all service logs
docker compose logs -f

# View only the app logs
docker compose logs -f app

# View last 100 lines of app logs
docker compose logs --tail 100 app
```

### Monitoring

- **Health endpoint:** Set up an uptime monitor (e.g., UptimeRobot, Better Uptime) to poll `https://yourdomain.com/api/health` every 1-5 minutes.
- **Sentry:** If configured, Sentry alerts you to errors via email or Slack.
- **Docker health checks:** Docker Compose has built-in health checks for all services. Run `docker compose ps` to see their status.

---

## 11. Troubleshooting

### App Won't Start

**Symptom:** `docker compose ps` shows the app container as `Restarting` or `Exit 1`.

**Check logs:**
```bash
docker compose logs app
```

**Common causes:**
- [ ] **Missing required env vars.** Look for errors like "Missing environment variable." Make sure all required variables in Section 5 are set.
- [ ] **Database connection failed.** Error includes "Can't reach database server." Verify PostgreSQL is healthy: `docker compose ps postgres`. Check `DATABASE_URL` format.
- [ ] **Port conflict.** Error includes "address already in use." Another process is using port 3000 (or 5432, 6379, etc.). Stop the conflicting process or change the port mapping in `docker-compose.yml`.

### Sign-Up Works but App Shows Errors

**Symptom:** Users can sign up/sign in through Clerk, but the app dashboard shows errors or blank pages.

**Cause:** Clerk webhook is not configured or not reaching your server.

**Fix:**
- [ ] Verify the webhook URL in Clerk dashboard matches your domain exactly: `https://yourdomain.com/api/auth/webhook`
- [ ] Check webhook logs in Clerk dashboard -- look for delivery failures.
- [ ] If using a reverse proxy, make sure it forwards POST requests to `/api/auth/webhook`.
- [ ] Check that `CLERK_WEBHOOK_SECRET` matches the signing secret shown in the Clerk webhook settings.

### Agent Workflows Fail

**Symptom:** Starting an agent workflow results in an immediate error or no response.

**Common causes:**
- [ ] **Missing `ANTHROPIC_API_KEY`.** The key must be set and valid. Test it: `curl -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" https://api.anthropic.com/v1/messages -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'`
- [ ] **API key out of credits.** Check your Anthropic dashboard for usage and billing.
- [ ] **Network issue.** The container must be able to reach `api.anthropic.com`. Check outbound network access.

### Export Fails

**Symptom:** Exporting to EPUB, PDF, or DOCX results in an error.

**Cause:** Pandoc or Typst is not available in the container. This only happens with custom Docker builds.

**Fix:**
- [ ] The official Dockerfile installs both Pandoc (via `apk add pandoc`) and Typst (v0.13.0 musl binary). If you built a custom image, make sure these are included.
- [ ] Verify inside the container: `docker compose exec app pandoc --version` and `docker compose exec app typst --version`.

### Checkout Completes but Plan Stays Free

**Symptom:** User completes Stripe checkout, sees a success page, but their plan remains "Free" in the app.

**Cause:** Stripe webhook is not configured or not delivering events.

**Fix:**
- [ ] Verify the webhook URL in Stripe dashboard matches: `https://yourdomain.com/api/billing/webhook`
- [ ] Verify all 3 events are selected: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- [ ] Check webhook logs in Stripe dashboard -- look for failed deliveries.
- [ ] Check that `STRIPE_WEBHOOK_SECRET` matches the signing secret from the Stripe webhook endpoint.

### Can't Upload Files

**Symptom:** Document upload fails with a storage error.

**Common causes:**
- [ ] **MinIO bucket missing.** If using Docker Compose, the `minio-init` service should have created it. Check: `docker compose logs minio-init`. If it failed, create manually: `docker compose exec minio mc mb --ignore-existing local/wmb-projects`
- [ ] **Wrong credentials.** If you overrode `MINIO_ROOT_USER` or `MINIO_ROOT_PASSWORD`, make sure the app's S3 credentials match.
- [ ] **MinIO not healthy.** Check: `docker compose ps minio`. Restart if needed: `docker compose restart minio`.

### Permission Errors

**Symptom:** File operation errors mentioning "permission denied."

**Fix:**
- [ ] The Docker image runs as user `nextjs` (UID 1001). Volume permissions must allow this user to read/write.
- [ ] For data volumes managed by Compose (pgdata, redisdata, etc.), Docker handles permissions automatically.

### Connection Timeouts

**Symptom:** The app starts but requests time out or return 502/504.

**Common causes:**
- [ ] **Services still starting.** Give all services a minute to become healthy. Check: `docker compose ps` -- all should show `(healthy)`.
- [ ] **Reverse proxy misconfiguration.** If using Nginx/Caddy, verify it is forwarding to the correct port (3000).
- [ ] **Memory exhaustion.** If the server has less than 4 GB RAM, services may be killed by the OOM killer. Check: `docker compose logs` for "Killed" messages.

### Redis Connection Errors

**Symptom:** App logs show "Redis connection refused" or "NOAUTH Authentication required."

**Fix:**
- [ ] **Password mismatch.** The Redis password in `REDIS_URL` must match the `--requirepass` value in the Docker Compose Redis service. Both default to `wmb-redis-prod`. If you changed one, change both.
- [ ] Verify Redis is running: `docker compose ps redis`.

---

*This guide was written for Write My Book OK v3.1. Last updated: 2026-02-28.*
