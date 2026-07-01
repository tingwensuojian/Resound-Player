FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Copy local tarball dependencies required by npm ci
COPY _amll_dist/ ./_amll_dist/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

FROM node:20-alpine

WORKDIR /app

# Copy pre-installed node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy server code
COPY server/ ./server/

EXPOSE 38763
ENV PORT=38763
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:38763/ >/dev/null 2>&1 || exit 1

USER node
CMD ["node", "server/unblock-match-server.mjs"]
