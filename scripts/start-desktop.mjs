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
import net from 'node:net';
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

// --- P0: Kill stale Electron processes (targeted by project path) ---
function killStaleElectronProcesses() {
  if (process.platform !== 'win32') return;
  try {
    const result = execSync(
      'wmic PROCESS where \"name=\\\'\\\'electron.exe\\\'\\\'\" get ProcessId,ExecutablePath /FORMAT:CSV',
      { stdio: 'pipe', encoding: 'utf-8', timeout: 5000 }
    );
    const processes = result.toString().split(String.fromCharCode(10));
    let killed = 0;
    for (const procLine of processes) {
      const parts = procLine.trim().split(',');
      if (parts.length < 3) continue;
      const exePath = (parts[1] || '').trim();
      const pid = (parts[2] || '').trim();
      if (!pid || !/^\d+$/.test(pid)) continue;
      if (exePath.toLowerCase().includes('resound')) {
        try {
          execSync('taskkill /F /PID ' + pid, { stdio: 'ignore', timeout: 3000 });
          killed++;
        } catch (e) {}
      }
    }
    if (killed > 0) console.log('[cleanup] cleared ' + killed + ' stale Resound-Player Electron process(es)');
  } catch (e) {
    try {
      execSync('taskkill /F /IM electron.exe', { stdio: 'ignore', timeout: 3000 });
    } catch (e2) {}
  }
}
killStaleElectronProcesses();

// --- P0: TCP port readiness check ---
function checkTcpPort(host, port, timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 2000;
  return new Promise(function(resolve) {
    var socket = new net.Socket();
    var resolved = false;
    var timer = setTimeout(function() {
      if (!resolved) { resolved = true; socket.destroy(); resolve(false); }
    }, timeoutMs);
    socket.on('connect', function() {
      if (!resolved) { resolved = true; socket.destroy(); resolve(true); }
    });
    socket.on('error', function() {
      if (!resolved) { resolved = true; resolve(false); }
    });
    socket.connect(port, host);
  });
}


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
// P0: Global EPIPE guard
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

const managedProcesses = [];

function spawnManagedProcess(label, command, args, env, options) {
  if (options === undefined) options = {};
  const maxRestarts = options.maxRestarts || 0;
  let restarts = 0;

  function start() {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    child.stdout.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        console.log('[' + label + '] ' + line);
      }
    });
    child.stdout.on('error', () => {});

    child.stderr.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        console.error('[' + label + ':err] ' + line);
      }
    });
    child.stderr.on('error', () => {});

    child.on('exit', (code, signal) => {
      const cleanExit = code === 0;
      console.log('[' + label + '] process exited(code=' + code + ' signal=' + signal + ')');

      const idx = managedProcesses.indexOf(child);
      if (idx !== -1) managedProcesses.splice(idx, 1);

      if (!cleanExit && maxRestarts > 0 && restarts < maxRestarts) {
        restarts++;
        const delay = Math.min(1000 * Math.pow(2, restarts - 1), 8000);
        console.log('[' + label + '] restart ' + restarts + '/' + maxRestarts + ', waiting ' + delay + 'ms...');
        setTimeout(start, delay);
      } else if (!cleanExit && restarts >= maxRestarts) {
        console.error('[' + label + '] exceeded max restarts(' + maxRestarts + '), giving up');
      }
    });

    child.on('error', (err) => {
      console.error('[' + label + '] spawn error: ' + err.message);
    });

    managedProcesses.push(child);
    return child;
  }

  return start();
}

// 1. Vite dev server
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (process.platform === 'win32') {
  spawnManagedProcess('vite', 'node', [viteEntry, '--port', String(ports.vite), '--strictPort'], viteEnv, { maxRestarts: 3 });
} else {
  spawnManagedProcess('vite', 'npx', ['vite', '--port', String(ports.vite), '--strictPort'], viteEnv, { maxRestarts: 3 });
}

// 2. Netease API server (port 38761)
spawnManagedProcess('netease-api', 'node', ['scripts/start-api.cjs'], { ...commonEnv, PORT: String(ports.api) }, { maxRestarts: 3 });

// 3. Unblock proxy
spawnManagedProcess('unblock-proxy', 'node', [
  'node_modules/@unblockneteasemusic/server/app.js',
  '-p', String(ports.unblockProxy),
  '-o', 'bodian', 'kugou', 'migu', 'qq', 'bilibili',
  '-s',
], unblockProxyEnv);

// 3.5. Unblock match server (fallback for native bridge)
// Electron 涓昏繘绋嬪唴缃?match 鑳藉姏锛坣ative bridge锛夋槸棣栭€夎矾寰勶紝
// 浣嗗綋 native bridge 鍥犵綉缁?DNS 绛夊師鍥犳棤缁撴灉鏃讹紝娓叉煋杩涚▼浼氬洖钀藉埌姝?HTTP 鏈嶅姟銆?
spawnManagedProcess('unblock-match', 'node', [
  'server/unblock-match-server.mjs',
], unblockMatchEnv);

// 4. Electron (waits for Vite)
// Launch Electron directly after a short delay so Vite has time to bind.
const electronBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");

// --- P0: Launch Electron after Vite is ready ---
async function launchElectron() {
  const vitePort = ports.vite;
  console.log('[electron] waiting for Vite(:' + vitePort + ') to be ready...');
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    ready = await checkTcpPort('127.0.0.1', vitePort);
    if (ready) break;
    await new Promise(function(r) { setTimeout(r, 500); });
  }
  if (!ready) {
    console.error('[electron] Vite(:' + vitePort + ') not ready within 30s, aborting');
    return;
  }
  console.log('[electron] Vite is ready, launching Electron...');
  const electronBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  return spawnManagedProcess('electron', electronBin, ['.'], electronEnv, { maxRestarts: 0 });
}

// Give Vite 1s then check readiness
setTimeout(function() { launchElectron(); }, 1000);




// 鈹€鈹€ Cleanup on exit 鈹€鈹€
function cleanup() {
  for (const child of managedProcesses) {
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

