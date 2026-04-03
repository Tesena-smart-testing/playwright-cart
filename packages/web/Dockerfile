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
COPY index.html ./
COPY vite.config.ts ./
COPY src/ ./src/
RUN pnpm run build

# ---- runtime: nginx ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
