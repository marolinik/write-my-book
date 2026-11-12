# P2-62: node pinned by exact version and digest (the 22-alpine tag on 2026-11-12).
FROM node:22.23-alpine3.24@sha256:5b05da3f938f1c604b24c633646d48805a6667f378cb4908438616f3cc48a0bf AS base

# Pandoc, Typst and the fonts the PDF export names, in their own stage so CI
# can build and check them without building the app (D13, P2-62).
FROM base AS export-tools
ENV TMPDIR=/tmp TEMP=/tmp TMP=/tmp
RUN apk add --no-cache pandoc curl \
    font-noto-cjk font-noto-naskh-arabic font-noto-arabic font-noto-devanagari
# Typst: static musl binary from GitHub releases, checked against its sha256.
ARG TYPST_VERSION=v0.13.0
ARG TYPST_SHA256=cd1148da61d6844e62c330fc6222e988480acafe33b76daec8eb5d221258feb6
RUN wget -qO /tmp/typst.tar.xz https://github.com/typst/typst/releases/download/${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz \
    && echo "${TYPST_SHA256}  /tmp/typst.tar.xz" | sha256sum -c - \
    && tar -xf /tmp/typst.tar.xz -C /tmp \
    && mv /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/ \
    && rm -rf /tmp/typst*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SENTRY_DSN

ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

ENV DATABASE_URL="postgresql://dummy:***@localhost:5432/dummy"
RUN npx prisma generate
# Build with CI=true so the fail-closed runtime env validator treats the
# dummy build-time values as the CI/build path (warnings, not errors). The
# builder is a scratch stage: CI is NOT set in the runner, so real production
# runtime validation still applies to the deployed process.
RUN CI=true npm run build

FROM export-tools AS runner
WORKDIR /app
ENV NODE_ENV=production
# Pandoc shells out for PDF via temp files; with no TMPDIR it resolved its temp
# dir to the read-only /app cwd and PDF export silently degraded to markdown
# (persona campaign H2). TMPDIR is set in export-tools, which this stage extends.

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/export-templates ./export-templates

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
