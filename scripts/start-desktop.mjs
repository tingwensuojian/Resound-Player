#!/usr/bin/env node

/**
 * Dev desktop orchestrator 鈥?starts renderer/backend services with auto-detected ports.
 *
 * Usage: node scripts/start-desktop.mjs
 *
 * Flow:
 *   1. Detect available ports (vite, api, unblock-proxy, unblock-match)
 *   2. Spawn all services with the resolved ports
 *   3. Forward stdout/stderr, clean up on exit
 *
 * 妗岄潰绔煶婧愭浛鎹㈤摼璺細
 *   娓叉煋杩涚▼ 鈫?IPC 鈫?Electron 涓昏繘绋嬪唴缃?match锛坣ative bridge锛屼紭鍏堬級
 *   娓叉煋杩涚▼ 鈫?HTTP 鈫?鐙珛 match 鏈嶅姟锛坒allback锛屽紑鍙戞ā寮忎笅浠嶅惎鍔ㄤ互淇濊瘉鍙敤鎬э級
 */

import { spawn, execSync } from 'node:child_process';
import { resolveServicePorts } from '../electron/port-manager.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// 鈹€鈹€ Cross-platform port killer 鈹€鈹€
function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr ":${port} "`, { stdio: 'pipe', encoding: 'utf-8', timeout: 3000 });
      const pids = new Set();
      for (const line of result.split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 3000 }); } catch {}
      }
    } else {
      execSync(`lsof -ti:${port} 2>/dev/null | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
    }
  } catch { /* port not in use */ }
}

const KILL_PORTS = [38761, 38762, 38763, 5173];
for (const port of KILL_PORTS) killProcessOnPort(port);

// 鈹€鈹€ Resolve ports 鈹€鈹€
const ports = await resolveServicePorts();
console.log('');
console.log('');
console.log('Resound-Player dev desktop starting...');
console.log('Vite -> :' + ports.vite);
console.log('Netease API -> :' + ports.api);
console.log('Unblock Proxy -> :' + ports.unblockProxy);
console.log('Unblock Match -> :' + ports.unblockMatch);
console.log('');
console.log('');

// 鈹€鈹€ Prepare env 鈹€鈹€
const servicePorts = JSON.stringify({
  api: ports.api,
  unblockProxy: ports.unblockProxy,
  unblockMatch: ports.unblockMatch,
});

const commonEnv = {
  ...process.env,
  SERVICE_PORTS: servicePorts,
};

const viteEnv = {
  ...commonEnv,
  VITE_API_PROXY_TARGET: `http://127.0.0.1:${ports.api}`,
  VITE_UNBLOCK_MATCH_TARGET: `http://127.0.0.1:${ports.unblockMatch}`,
  VITE_DEV_SERVER_URL: `http://localhost:${ports.vite}`,
};

const electronEnv = {
  ...commonEnv,
  VITE_DEV_SERVER_URL: `http://localhost:${ports.vite}`,
};

const unblockProxyEnv = {
  ...commonEnv,
  ENABLE_FLAC: 'true',
};

const unblockMatchEnv = {
  ...commonEnv,
  PORT: String(ports.unblockMatch),
  UNBLOCK_SOURCES: 'bodian,kugou,migu,qq,bilibili',
  ENABLE_FLAC: 'true',
};

// 鈹€鈹€ Spawn processes 鈹€鈹€
const children = [];

function spawnProcess(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  child.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      console.log(`[${label}] ${line}`);
    }
  });

  child.stderr.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      console.error(`[${label}:err] ${line}`);
    }
  });

  child.on('exit', (code) => {
    console.log(`[${label}] 杩涚▼閫€鍑?(code=${code})`);
  });

  children.push(child);
  return child;
}

// 1. Vite dev server
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (process.platform === 'win32') {
  spawnProcess('vite', 'node', [viteEntry, '--port', String(ports.vite), '--strictPort'], viteEnv);
} else {
  spawnProcess('vite', 'npx', ['vite', '--port', String(ports.vite), '--strictPort'], viteEnv);
}

// 2. Netease API server (port 38761)
spawnProcess('netease-api', 'node', ['scripts/start-api.cjs'], { ...commonEnv, PORT: String(ports.api) });

// 3. Unblock proxy
spawnProcess('unblock-proxy', 'node', [
  'node_modules/@unblockneteasemusic/server/app.js',
  '-p', String(ports.unblockProxy),
  '-o', 'bodian', 'kugou', 'migu', 'qq', 'bilibili',
  '-s',
], unblockProxyEnv);

// 3.5. Unblock match server (fallback for native bridge)
// Electron 涓昏繘绋嬪唴缃?match 鑳藉姏锛坣ative bridge锛夋槸棣栭€夎矾寰勶紝
// 浣嗗綋 native bridge 鍥犵綉缁?DNS 绛夊師鍥犳棤缁撴灉鏃讹紝娓叉煋杩涚▼浼氬洖钀藉埌姝?HTTP 鏈嶅姟銆?
spawnProcess('unblock-match', 'node', [
  'server/unblock-match-server.mjs',
], unblockMatchEnv);

// 4. Electron (waits for Vite)
// Launch Electron directly after a short delay so Vite has time to bind.
const electronBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
setTimeout(() => {
  spawnProcess("electron", electronBin, ["."], electronEnv);
}, 4000);

// 鈹€鈹€ Cleanup on exit 鈹€鈹€
function cleanup() {
  for (const child of children) {
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);
