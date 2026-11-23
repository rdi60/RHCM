# syntax=docker/dockerfile:1
#
# Multi-stage build for the Next.js web app. Build context is the monorepo
# root (see docker-compose.prod.yml) so pnpm can resolve the @rhcm/shared
# workspace package this app transpiles directly from source.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# --- Install dependencies and build -----------------------------------------
FROM base AS build

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY packages/config ./packages/config
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build-time public API base URL — baked into the client bundle, so it must
# be supplied at image build time, not just at container run time.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN pnpm --filter @rhcm/shared build && pnpm --filter @rhcm/web build

# --- Runtime image (Next.js standalone output) -------------------------------
FROM node:22-alpine AS runtime
RUN addgroup -S rhcm && adduser -S rhcm -G rhcm
WORKDIR /app

COPY --from=build --chown=rhcm:rhcm /repo/apps/web/.next/standalone ./
COPY --from=build --chown=rhcm:rhcm /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=rhcm:rhcm /repo/apps/web/.next/static ./apps/web/.next/static

USER rhcm
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
