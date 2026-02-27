This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Pandoc & Typst Setup

Pandoc and Typst are required for manuscript export (DOCX, EPUB, PDF). Without them, the export pipeline will throw an error with a link back to this section.

### Minimum Versions

| Tool   | Minimum | Reason                                   |
|--------|---------|------------------------------------------|
| Pandoc | >= 3.1  | Required for Typst output and Lua filter API |
| Typst  | >= 0.11 | Latest stable recommended                |

### Verification Commands

```bash
pandoc --version
# Expected: pandoc 3.x.x

typst --version
# Expected: typst 0.x.x
```

### Windows

```bash
# Using Chocolatey
choco install pandoc typst

# Or download installers:
# Pandoc: https://pandoc.org/installing.html
# Typst:  https://github.com/typst/typst/releases
```

### macOS

```bash
brew install pandoc typst
```

### Linux (Debian/Ubuntu)

```bash
sudo apt-get install pandoc

# Typst: download from GitHub releases
wget https://github.com/typst/typst/releases/download/v0.13.0/typst-x86_64-unknown-linux-musl.tar.xz
tar -xf typst-x86_64-unknown-linux-musl.tar.xz
sudo mv typst-x86_64-unknown-linux-musl/typst /usr/local/bin/
```

### Docker Compose (zero config)

Pandoc and Typst are pre-installed in the Docker image. No additional setup needed when using `docker compose up`.

### Vercel

Vercel serverless functions do **not** support Pandoc (binary size limits, no persistent filesystem). Export functionality requires self-hosting or Railway. All other features (editing, AI agents, etc.) work on Vercel.

### Railway

Use the included Dockerfile -- Pandoc and Typst are pre-installed. Railway's Docker deployments work out of the box.

### End-to-End Health Check

```bash
# Verify Pandoc
pandoc --version | head -1

# Verify Typst
typst --version

# Verify Lua filters are accessible
ls export-templates/*.lua

# Test a minimal EPUB export
echo "# Test" | pandoc -o test.epub && echo "EPUB export OK" && rm test.epub
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
