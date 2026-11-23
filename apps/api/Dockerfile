# syntax=docker/dockerfile:1
#
# Multi-stage build for the NestJS API. Build context is the monorepo root
# (see docker-compose.prod.yml) so pnpm can resolve the @rhcm/shared and
# @rhcm/database workspace packages this app depends on.

FROM node:22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo

# --- Install dependencies and build the workspace ---------------------------
FROM base AS build

# Copy manifests first so `pnpm install` is cached unless a dependency changed.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/database/package.json packages/database/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm --filter @rhcm/shared build \
  && pnpm --filter @rhcm/database generate \
  && pnpm --filter @rhcm/database build \
  && pnpm --filter @rhcm/api build

# A self-contained, production-only install for just this app — pnpm deploy
# resolves @rhcm/shared and @rhcm/database (per their package.json "files")
# into node_modules rather than leaving them as workspace symlinks. --legacy
# because this workspace doesn't set inject-workspace-packages=true (pnpm
# v10's newer, hardlink-based deploy mode isn't necessary for a one-shot
# image build).
RUN pnpm --filter @rhcm/api deploy --prod --legacy /app/deploy

# --- Runtime image -----------------------------------------------------------
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl \
  && addgroup -S rhcm && adduser -S rhcm -G rhcm
WORKDIR /app
COPY --from=build --chown=rhcm:rhcm /app/deploy ./
USER rhcm
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/main.js"]
