#!/bin/sh
# Resound-Player All-in-One Startup Script
# Starts Nginx, Netease API, Unblock Proxy, and Unblock Match Server

set -e

echo "[start-all] Starting Nginx..."
nginx -c /etc/nginx/nginx-allinone.conf

echo "[start-all] Starting Netease API (port 38761)..."
PORT=38761 node /app/scripts/start-api.cjs &
API_PID=$!

sleep 2

echo "[start-all] Starting Unblock Proxy (port 38762)..."
node /app/node_modules/@unblockneteasemusic/server/app.js -p 38762 -o bodian kugou migu qq bilibili -s &
PROXY_PID=$!

echo "[start-all] Starting Unblock Match Server (port 38763)..."
node /app/server/unblock-match-server.mjs &
MATCH_PID=$!

echo "[start-all] All services started:"
echo "  Nginx:        80"
echo "  Netease API:  38761 (PID $API_PID)"
echo "  Unblock Proxy: 38762 (PID $PROXY_PID)"
echo "  Unblock Match: 38763 (PID $MATCH_PID)"

cleanup() {
    echo "[start-all] Shutting down..."
    kill $API_PID $PROXY_PID $MATCH_PID 2>/dev/null
    nginx -s quit 2>/dev/null
    wait
}
trap cleanup INT TERM

wait