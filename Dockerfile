FROM node:22-alpine AS base

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

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Pandoc shells out for PDF via temp files; with no TMPDIR it resolved its temp
# dir to the read-only /app cwd and PDF export silently degraded to markdown
# (persona campaign H2). Point temp resolution at writable /tmp.
ENV TMPDIR=/tmp TEMP=/tmp TMP=/tmp

# Install Pandoc + Typst for manuscript export pipeline
RUN apk add --no-cache pandoc curl
# Typst: install static musl binary from GitHub releases
RUN wget -qO /tmp/typst.tar.xz https://github.com/typst/typst/releases/download/v0.13.0/typst-x86_64-unknown-linux-musl.tar.xz \
    && tar -xf /tmp/typst.tar.xz -C /tmp \
    && mv /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/ \
    && rm -rf /tmp/typst*

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
