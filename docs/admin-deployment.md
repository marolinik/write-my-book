# Deployment Guide

This guide covers deploying Write My Book with all infrastructure dependencies.

## Prerequisites

| Dependency | Version | Required |
|-----------|---------|----------|
| Node.js | 20+ | Yes |
| PostgreSQL | 15+ | Yes |
| Docker & Docker Compose | Latest | Recommended |
| Pandoc | 3.1+ | For export (EPUB/PDF/DOCX) |
| Typst | 0.11+ | For PDF export |

## Environment Variables

Copy `.env.example` to `.env` and configure the following variables, grouped by service.

### Database

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/writemybook?schema=public` | PostgreSQL connection string |

### Authentication (Clerk)

| Variable | Example | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | From [clerk.com](https://clerk.com) dashboard |
| `CLERK_SECRET_KEY` | `sk_live_...` | Server-side only |
| `CLERK_WEBHOOK_SECRET` | `whsec_...` | For user sync webhook |

### API Key Encryption

| Variable | Example | Notes |
|----------|---------|-------|
| `API_KEY_ENCRYPTION_SECRET` | 64-char hex string | **Generate with:** `openssl rand -hex 32` |

This secret encrypts user API keys (AES-256-GCM). Losing this value makes all stored API keys unrecoverable. **Back it up securely.**

### Object Storage (MinIO / S3)

| Variable | Example | Notes |
|----------|---------|-------|
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO or any S3-compatible endpoint |
| `S3_ACCESS_KEY_ID` | `minioadmin` | Access key |
| `S3_SECRET_ACCESS_KEY` | `minioadmin` | Secret key |
| `S3_BUCKET` | `wmb-projects` | Bucket name (auto-created by Docker Compose) |
| `S3_FORCE_PATH_STYLE` | `true` | Required for MinIO, optional for AWS S3 |

### Vector Database (Qdrant)

| Variable | Example | Notes |
|----------|---------|-------|
| `QDRANT_URL` | `http://localhost:6333` | Qdrant REST API endpoint |
| `QDRANT_API_KEY` | *(optional)* | Required only if Qdrant is configured with auth |

### Embedding Provider

| Variable | Example | Notes |
|----------|---------|-------|
| `VOYAGE_API_KEY` | `pa-...` | For Voyage AI embeddings (semantic memory) |

### Graph Database (Neo4j)

| Variable | Example | Notes |
|----------|---------|-------|
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j Bolt protocol endpoint |
| `NEO4J_USER` | `neo4j` | Username |
| `NEO4J_PASSWORD` | `wmb-neo4j-dev` | Password |

### Billing (Stripe) -- Optional

| Variable | Example | Notes |
|----------|---------|-------|
| `STRIPE_SECRET_KEY` | `sk_live_...` | Server-side Stripe key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | For billing webhook |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Client-side Stripe key |

### Error Tracking (Sentry) -- Optional

| Variable | Example | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_SENTRY_DSN` | `https://...@sentry.io/...` | Sentry project DSN |

## Pandoc and Typst

Pandoc and Typst are required for manuscript export (EPUB, PDF, DOCX). Without them, all other features work normally -- only the export pipeline is affected.

### Installation

**macOS:**
```bash
brew install pandoc typst
```

**Windows:**
```bash
choco install pandoc typst
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install pandoc
# Typst: download binary from https://github.com/typst/typst/releases
```

**Docker:** Pandoc and Typst are pre-installed in the Dockerfile. No additional setup needed.

### Verification

```bash
pandoc --version    # Expected: pandoc 3.x.x
typst --version     # Expected: typst 0.x.x
```

If Pandoc or Typst is not found at runtime, the export API returns an actionable error message telling the user exactly what to install.

## Qdrant Vector Database

Qdrant provides semantic memory search -- agents can recall relevant passages from manuscripts, story bibles, and previous session history.

### Running Qdrant

**Via Docker Compose** (recommended): Qdrant is included in the `docker-compose.yml` and starts automatically on port 6333.

**Standalone Docker:**
```bash
docker run -d --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  -v qdrant_data:/qdrant/storage \
  qdrant/qdrant:v1.13.2
```

### Graceful Degradation

If Qdrant is unavailable, agents work normally without memory search. The platform logs a warning but does not block any workflows. Memory indexing and search are silently skipped.

### Data

Qdrant stores vectors in a single `wmb_memory` collection. Data persists in the `qdrantdata` Docker volume. Back up this volume along with PostgreSQL and MinIO for complete data recovery.

## Docker Compose Quick Start

The fastest way to run the full stack locally:

```bash
# 1. Clone and enter the project
cd platform-new

# 2. Copy environment template
cp .env.example .env
# Edit .env with your Clerk keys, encryption secret, etc.

# 3. Start all services
docker compose up -d

# 4. Wait for health checks to pass (30-60 seconds)
docker compose ps

# 5. Push database schema
npx prisma db push

# 6. Start the development server
npm run dev
```

This starts PostgreSQL, Redis, MinIO (with auto-created bucket), Neo4j, Qdrant, and the Next.js application.

### Docker Compose Services

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Primary database |
| `redis` | 6379 | Caching and session state |
| `minio` | 9000 (API), 9001 (Console) | S3-compatible object storage |
| `neo4j` | 7474 (HTTP), 7687 (Bolt) | Graph database |
| `qdrant` | 6333 (REST), 6334 (gRPC) | Vector database |
| `app` | 3000 | Next.js application |

## Production Considerations

### HTTPS and Reverse Proxy

Use a reverse proxy (nginx, Caddy, Traefik) in front of the application for TLS termination. The app listens on port 3000 by default (configurable via `APP_PORT`).

### Persistent Storage

Ensure Docker volumes are backed up regularly:
- `pgdata` -- PostgreSQL data (books, chapters, users, sessions)
- `miniodata` -- Uploaded manuscripts and generated documents
- `qdrantdata` -- Vector embeddings for semantic memory
- `neo4jdata` -- Knowledge graph data

### Backup Strategy

1. **PostgreSQL:** Use `pg_dump` on a schedule (daily recommended)
2. **MinIO:** Sync bucket to a secondary location with `mc mirror`
3. **Qdrant:** Snapshot via Qdrant's REST API (`POST /collections/wmb_memory/snapshots`)
4. **Neo4j:** Use `neo4j-admin dump` for offline backups

### Scaling

The application is stateless (session state is in Redis). You can run multiple app instances behind a load balancer. All services (PostgreSQL, MinIO, Qdrant, Neo4j, Redis) should be single-instance or use their own clustering mechanisms.

### Vercel Limitations

Vercel serverless functions do not support Pandoc (binary size limits, no persistent filesystem). If you need export functionality, self-host or use Railway with the included Dockerfile. All other features (editing, AI agents, settings) work on Vercel.
