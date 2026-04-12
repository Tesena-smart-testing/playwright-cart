FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile --filter @playwright-cart/web

# ---- build ----
FROM deps AS build
COPY tsconfig.json ./
COPY packages/web/tsconfig.json ./packages/web/
COPY packages/web/index.html ./packages/web/
COPY packages/web/vite.config.ts ./packages/web/
COPY packages/web/public/ ./packages/web/public/
COPY packages/web/scripts/ ./packages/web/scripts/
COPY packages/web/src/ ./packages/web/src/
RUN pnpm --filter @playwright-cart/web run build

# ---- runtime: nginx ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
