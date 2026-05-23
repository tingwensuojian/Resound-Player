import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Health check ──

function checkHealth(apiBaseUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${apiBaseUrl}/banner`, (res) => {
      resolve(Boolean(res.statusCode && res.statusCode < 500));
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => { req.destroy(); resolve(false); });
  });
}

export async function waitApiReady(apiBaseUrl, timeoutMs = 25000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await checkHealth(apiBaseUrl);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ── API entrypoint resolver (copied from apiProcess.js) ──

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// ── asar-aware root resolver ──

/** 检测是否运行在打包后的应用中 */
const isPackaged = () => __dirname.includes('app.asar');

/**
 * 返回应用根目录（打包后指向 app.asar.unpacked 同级目录，开发模式使用 __dirname 相对路径）。
 * spawn() 的 cwd 和所有子进程脚本路径都必须基于此 root，避免指向 app.asar 内部。
 */
function getAppRoot() {
  if (isPackaged() && process.resourcesPath) {
    // 打包后：Resources/app.asar.unpacked/ 的上级 = Resources/
    return path.join(process.resourcesPath, 'app.asar.unpacked');
  }
  return path.join(__dirname, '..');
}

/**
 * 解析 spawn 子进程可访问的脚本路径。
 * 打包后优先从 app.asar.unpacked 解析，开发模式使用 __dirname 相对路径。
 */
function resolveSpawnPath(relativeFilePath) {
  const root = getAppRoot();
  const fullPath = path.join(root, relativeFilePath);
  if (isFile(fullPath)) return fullPath;
  // 尝试解析为 node_modules 包入口
  const parts = relativeFilePath.split('/');
  const pkgIndex = parts.indexOf('node_modules');
  if (pkgIndex !== -1) {
    const pkgRoot = path.join(root, ...parts.slice(0, pkgIndex + 2));
    const pkgJson = path.join(pkgRoot, 'package.json');
    if (isFile(pkgJson)) {
      const entry = findEntry(pkgRoot);
      if (entry) return entry;
    }
  }
  return fullPath;
}

/**
 * 解析 api-enhanced 包入口文件路径。
 * 需要处理 pnpm 的 symlink：@neteasecloudmusicapienhanced/api 可能在
 * node_modules 中是一个指向 pnpm store 的符号链接，打包后需通过 realpath 解析。
 */
function resolveApiEntrypath(pkgRoot) {
  // 尝试直接检查
  if (isFile(path.join(pkgRoot, 'package.json'))) return pkgRoot;
  // 尝试解析 symlink (pnpm)
  try {
    const stat = fs.lstatSync(pkgRoot);
    if (stat.isSymbolicLink()) {
      const real = fs.realpathSync(pkgRoot);
      if (real !== pkgRoot && isFile(path.join(real, 'package.json'))) return real;
    }
  } catch { /* ignore */ }
  // 尝试上级 node_modules/.pnpm 目录（electron-builder 打包后可能保留实际文件）
  const parent = path.dirname(pkgRoot);
  const grandParent = path.dirname(parent);
  if (path.basename(grandParent) === 'node_modules') {
    const pnpmDir = path.join(grandParent, '.pnpm');
    if (isExists(pnpmDir)) {
      try {
        const entries = fs.readdirSync(pnpmDir);
        // 查找匹配 @neteasecloudmusicapienhanced+api 的目录
        const match = entries.find(e => e.startsWith('@neteasecloudmusicapienhanced+api'));
        if (match) {
          const candidate = path.join(pnpmDir, match, 'node_modules', path.basename(parent), path.basename(pkgRoot));
          if (isFile(path.join(candidate, 'package.json'))) return candidate;
        }
      } catch { /* ignore */ }
    }
  }
  return null;
}

function resolveApiEntrypoint() {
  const root = getAppRoot();
  const basePath = path.join(root, 'node_modules', '@neteasecloudmusicapienhanced', 'api');

  // 先检查根路径
  const pkgRoot = resolveApiEntrypath(basePath);
  if (pkgRoot) {
    const entry = findEntry(pkgRoot);
    if (entry) return entry;
  }

  // 打包后：也检查 app.asar.unpacked（与 root 不同时）
  if (isPackaged() && process.resourcesPath) {
    const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked');
    if (unpackedRoot !== root) {
      const up = path.join(unpackedRoot, 'node_modules', '@neteasecloudmusicapienhanced', 'api');
      const upPkgRoot = resolveApiEntrypath(up);
      if (upPkgRoot) {
        const entry = findEntry(upPkgRoot);
        if (entry) return entry;
      }
    }
  }

  throw new Error('Cannot resolve api-enhanced entrypoint');
}

function findEntry(pkgRoot) {
  const pkgPath = path.join(pkgRoot, 'package.json');
  if (!isFile(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const candidates = ['app.js', 'index.js', 'server.js', pkg.main, pkg.module].filter(Boolean);
    for (const rel of candidates) {
      const abs = path.resolve(pkgRoot, rel);
      if (isFile(abs)) return abs;
    }
  } catch {}
  return null;
}

// ── Spawn functions ──

function spawnNeteaseApi(port) {
  const apiEntrypoint = resolveApiEntrypoint();
  const appRoot = getAppRoot();
  const child = spawn(process.execPath, [apiEntrypoint], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      CORS_ALLOW_ORIGIN: '*',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    console.log(`[netease-api] ${chunk.toString().trim()}`);
  });
  child.stdout.on('error', () => {});
  child.stderr.on('data', (chunk) => {
    console.error(`[netease-api:err] ${chunk.toString().trim()}`);
  });
  child.stderr.on('error', () => {});
  child.on('exit', (code, signal) => {
    console.log(`[netease-api] exited code=${code} signal=${signal}`);
  });
  return child;
}

function spawnUnblockProxy(port) {
  const appScript = resolveSpawnPath('node_modules/@unblockneteasemusic/server/app.js');
  const appRoot = getAppRoot();
  const child = spawn(process.execPath, [
    appScript,
    '-p', String(port),
    '-o', 'bodian', 'kugou', 'migu', 'qq', 'bilibili',
    '-s',
  ], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ENABLE_FLAC: 'true',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    console.log(`[unblock-proxy] ${chunk.toString().trim()}`);
  });
  child.stdout.on('error', () => {});
  child.stderr.on('data', (chunk) => {
    console.error(`[unblock-proxy:err] ${chunk.toString().trim()}`);
  });
  child.stderr.on('error', () => {});
  child.on('exit', (code, signal) => {
    console.log(`[unblock-proxy] exited code=${code} signal=${signal}`);
  });
  return child;
}

function spawnUnblockMatch(port, unblockProxyPort) {
  const appScript = resolveSpawnPath('server/unblock-match-server.mjs');
  const appRoot = getAppRoot();
  const child = spawn(process.execPath, [appScript], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      UNBLOCK_PROXY_URL: `http://127.0.0.1:${unblockProxyPort}`,
      UNBLOCK_SOURCES: 'bodian,kugou,migu,qq,bilibili',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    console.log(`[unblock-match] ${chunk.toString().trim()}`);
  });
  child.stdout.on('error', () => {});
  child.stderr.on('data', (chunk) => {
    console.error(`[unblock-match:err] ${chunk.toString().trim()}`);
  });
  child.stderr.on('error', () => {});
  child.on('exit', (code, signal) => {
    console.log(`[unblock-match] exited code=${code} signal=${signal}`);
  });
  return child;
}

// ── Public API ──

/**
 * Start all 3 backend services with dynamically resolved ports.
 *
 * @param {{ api:number, unblockProxy:number, unblockMatch:number }} ports
 * @param {boolean} [skipUnblock=false]  When true, only start the Netease API (dev mode)
 * @returns {{ apiChild, proxyChild, matchChild }}
 */
export function startAllServices(ports, skipUnblock = false) {
  if (skipUnblock) {
    console.log(`[serviceManager] 开发模式：仅启动 Netease API (:${ports.api})`);
  } else {
    console.log(`[serviceManager] starting services:
    Netease API      → :${ports.api}
    Unblock Proxy    → :${ports.unblockProxy}
    Unblock Match    → :${ports.unblockMatch}`);
  }

  const apiChild = spawnNeteaseApi(ports.api);
  const proxyChild = skipUnblock ? null : spawnUnblockProxy(ports.unblockProxy);
  const matchChild = skipUnblock ? null : spawnUnblockMatch(ports.unblockMatch, ports.unblockProxy);

  return { apiChild, proxyChild, matchChild };
}

/**
 * Kill a child process, using taskkill on Windows for process tree cleanup.
 */
function killProcess(name, child) {
  if (!child || child.killed) return;
  console.log(`[serviceManager] killing ${name} (pid ${child.pid})`);
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
    } catch {
      child.kill('SIGTERM');
    }
  } else {
    child.kill('SIGTERM');
  }
}

/**
 * Kill all child processes gracefully.
 */
export function killAllServices(children) {
  for (const [name, child] of Object.entries(children)) {
    killProcess(name, child);
  }
}