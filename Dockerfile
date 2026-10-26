# ---------- Stage 1: build the site ----------
FROM oven/bun:1 AS build
WORKDIR /build

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts
COPY plugins ./plugins
COPY .figma ./.figma

RUN bun run build

# ---------- Stage 2: lightweight runtime ----------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8788 \
    LLM_PROVIDER=openai \
    LLM_BASE_URL=http://host.docker.internal:11434/v1 \
    LLM_API_KEY=ollama \
    LLM_MODEL=qwen3:14b \
    DATA_DIR=/app/data \
    DIST_DIR=/app/dist

COPY --from=build /build/dist ./dist
COPY server.mjs package.json ./
RUN mkdir -p /app/data

EXPOSE 8788
CMD ["node", "server.mjs"]
