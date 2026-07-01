# =============================================================================
# Resound-Player Unblock Match Server
# Build: docker build -t resound-player-server .
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# =============================================================================
FROM node:20-alpine

WORKDIR /app

# Copy pre-installed node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy server code
COPY server/ ./server/

# Runtime metadata
EXPOSE 38763
ENV PORT=38763
ENV NODE_ENV=production

# Health check (the server responds 404 on /, which means it`s alive)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:$PORT/ >/dev/null 2>&1 || exit 1

USER node
CMD ["node", "server/unblock-match-server.mjs"]
