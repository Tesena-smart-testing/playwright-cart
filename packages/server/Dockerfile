FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/
RUN pnpm install --frozen-lockfile --filter @playwright-cart/server

# ---- build ----
FROM deps AS build
COPY tsconfig.json ./
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/server/src/ ./packages/server/src/
RUN pnpm --filter @playwright-cart/server run build

# ---- runtime ----
FROM node:24-alpine AS runtime
WORKDIR /app/packages/server
ENV NODE_ENV=production

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/packages/server/node_modules ./node_modules
COPY --from=build /app/packages/server/dist ./dist
COPY packages/server/package.json ./

EXPOSE 3001
CMD ["node", "dist/index.js"]
