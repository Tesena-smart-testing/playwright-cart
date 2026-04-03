FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3001
CMD ["node", "dist/index.js"]
