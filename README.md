# Write My Book

A Next.js 15+ book-authoring platform with AI editorial agents. Authors import manuscripts, run AI-powered editorial workflows (developmental editing, line editing, beta reading, style analysis, continuity checking), and export to EPUB, PDF, and DOCX.

**Stack:** Next.js 15, Prisma 7, PostgreSQL, Clerk, Stripe, MinIO (S3), Qdrant, Neo4j, Anthropic + OpenRouter + OpenAI + Gemini + Grok

## v3.0 Features

- **Bring Your Own Keys (BYOK)** -- Use your own API keys from 5 providers (Anthropic, OpenRouter, OpenAI, Google Gemini, xAI Grok). No platform markup -- you pay providers directly.
- **Multi-Provider Model Selection** -- 34+ models across 5 providers. Choose which AI model to use per agent role, per book, or globally.
- **4-Level Resolution Chain** -- Fine-grained model control: book role override > book default > global role override > global default.
- **Vector Memory** -- Semantic search across manuscripts, story bibles, and session history via Qdrant. Agents recall relevant context automatically.
- **Pre-Session Cost Estimates** -- See estimated cost before starting any workflow, based on the resolved model and expected token usage.
- **Live Cost Tracking** -- Real-time cost counter during agent sessions.
- **Beta Score Analytics** -- Per-chapter beta reader scores with trend visualization and actionable breakdowns.
- **Onboarding Wizard** -- First-time users are guided through API key setup before accessing the platform.

## Key Capabilities

- **14 AI Agents** across 27 workflows covering the full editorial pipeline
- **Manuscript Import** from DOCX with automatic chapter detection
- **Export** to EPUB, PDF, and DOCX via Pandoc and Typst
- **Editorial Dashboard** with findings, apply/undo, and edit history
- **Style Profiling** with fingerprint capture, refresh, and evolution
- **Series Management** with cross-book continuity checking
- **Inline AI Editing** -- Select text, press F2, get rewrite suggestions

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure (PostgreSQL, Redis, MinIO, Neo4j, Qdrant)
docker compose up -d

# 3. Copy environment template and configure
cp .env.example .env

# 4. Push database schema
npx prisma db push

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and follow the onboarding wizard to add your first API key.

## Documentation

Detailed guides are available in the [`docs/`](./docs/) directory:

- [**BYOK User Guide**](./docs/user-guide-byok.md) -- How to add, validate, and manage API keys for all 5 providers
- [**Model Selection Guide**](./docs/user-guide-models.md) -- Understanding the 4-level resolution chain, cost tiers, and role overrides
- [**Deployment Guide**](./docs/admin-deployment.md) -- Environment variables, Pandoc/Typst setup, Qdrant, Docker Compose, and production considerations

## Pandoc & Typst Setup

Pandoc and Typst are required for manuscript export (DOCX, EPUB, PDF). Without them, the export pipeline will show an actionable error message. All other features work without them.

### Minimum Versions

| Tool   | Minimum | Reason                                   |
|--------|---------|------------------------------------------|
| Pandoc | >= 3.1  | Required for Typst output and Lua filter API |
| Typst  | >= 0.11 | Latest stable recommended                |

### Installation

```bash
# macOS
brew install pandoc typst

# Windows (Chocolatey)
choco install pandoc typst

# Linux (Debian/Ubuntu)
sudo apt-get install pandoc
# Typst: download from https://github.com/typst/typst/releases
```

**Docker:** Pandoc and Typst are pre-installed in the Dockerfile. No setup needed with `docker compose up`.

**Vercel:** Serverless functions do not support Pandoc (binary size limits). Export requires self-hosting or Railway. All other features work on Vercel.

### Verification

```bash
pandoc --version    # Expected: pandoc 3.x.x
typst --version     # Expected: typst 0.x.x
```

## Deploy on Vercel

The easiest way to deploy (without export support) is the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme). For full functionality including export, use Docker with the included `Dockerfile` and `docker-compose.yml`.

See the [Deployment Guide](./docs/admin-deployment.md) for detailed instructions.
