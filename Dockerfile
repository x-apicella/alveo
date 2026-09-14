# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public env vars are inlined at build time.
ARG NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV ALVEO_DATABASE_URL=postgres://build:build@localhost/build
RUN pnpm build
RUN pnpm exec esbuild scripts/provision-release-smoke.mjs --bundle --platform=node --format=esm --outfile=/tmp/provision-release-smoke.mjs

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migrations are applied by src/instrumentation.ts at startup.
COPY drizzle ./drizzle
COPY scripts/release-vps.mjs /opt/alveo-release/scripts/release-vps.mjs
COPY --from=build /tmp/provision-release-smoke.mjs /opt/alveo-release/scripts/provision-release-smoke.mjs
COPY deploy/vps/compose.yaml deploy/vps/release.compose.yaml /opt/alveo-release/deploy/vps/
COPY deploy/rollback-policy.json /opt/alveo-release/deploy/rollback-policy.json
EXPOSE 3000
CMD ["node", "server.js"]
