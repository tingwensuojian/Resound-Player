import Module from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceLogFile = path.join(os.tmpdir(), 'resound-player-service.log');

function writeServiceLog(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.map((part) => {
    if (part instanceof Error) return `${part.name}: ${part.message}\n${part.stack || ''}`;
    if (typeof part === 'string') return part;
    try { return JSON.stringify(part); } catch { return String(part); }
  }).join(' ')}\n`;
  try {
    fs.appendFileSync(serviceLogFile, line, 'utf8');
  } catch {
    // ignore log write failures
  }
}

// ── Health check ──

function checkHealth(apiBaseUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${apiBaseUrl}/`, (res) => {
      resolve(Boolean(res.statusCode && res.statusCode < 500));
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => { req.destroy(); resolve(false); });
  });
}

export async function waitApiReady(apiBaseUrl, timeoutMs = 25000) {
  writeServiceLog('[waitApiReady] start', { apiBaseUrl, timeoutMs });
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await checkHealth(apiBaseUrl);
    if (ok) {
      writeServiceLog('[waitApiReady] ready', { apiBaseUrl, elapsedMs: Date.now() - startedAt });
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  writeServiceLog('[waitApiReady] timeout', { apiBaseUrl, timeoutMs });
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
    return process.resourcesPath;
  }
  return path.join(__dirname, '..');
}

function getPackagedRoots(preferUnpacked = false) {
  if (!isPackaged() || !process.resourcesPath) return [];
  const packedRoot = path.join(process.resourcesPath, 'app.asar');
  const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked');
  return preferUnpacked ? [unpackedRoot, packedRoot] : [packedRoot, unpackedRoot];
}

/**
 * 解析 spawn 子进程可访问的脚本路径。
 * 打包后优先从 app.asar.unpacked 解析，开发模式使用 __dirname 相对路径。
 */
function resolveSpawnPath(relativeFilePath) {
  const roots = [...getPackagedRoots(), getAppRoot()];
  for (const root of roots) {
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
  }
  return path.join(getAppRoot(), relativeFilePath);
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

function resolveApiPackageRoot(preferUnpacked = false) {
  // In packaged mode, in-process API loads should prefer app.asar so package
  // dependencies like dotenv still resolve through the packed node_modules tree.
  const roots = [...getPackagedRoots(preferUnpacked), getAppRoot()];
  for (const root of roots) {
    const pkgRoot = path.join(root, 'node_modules', '@neteasecloudmusicapienhanced', 'api');
    if (isFile(path.join(pkgRoot, 'package.json'))) {
      return pkgRoot;
    }
  }

  const fallbackRoots = [...getPackagedRoots(preferUnpacked), getAppRoot()];
  for (const root of fallbackRoots) {
    const basePath = path.join(root, 'node_modules', '@neteasecloudmusicapienhanced', 'api');
    const resolved = resolveApiEntrypath(basePath);
    if (resolved) {
      return resolved;
    }
  }
  throw new Error('Cannot resolve api-enhanced package root');
}

function dedupeExistingPaths(paths) {
  const seen = new Set();
  return paths.filter((candidate) => {
    if (!candidate || seen.has(candidate) || !isExists(candidate)) {
      return false;
    }
    seen.add(candidate);
    return true;
  });
}

function collectNestedNodeModulePaths(nodeModulesRoot) {
  if (!isExists(nodeModulesRoot)) return [];

  const nestedRoots = [];
  try {
    const entries = fs.readdirSync(nodeModulesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (entry.name.startsWith('@')) {
        const scopeRoot = path.join(nodeModulesRoot, entry.name);
        const scopedEntries = fs.readdirSync(scopeRoot, { withFileTypes: true });
        for (const scopedEntry of scopedEntries) {
          if (!scopedEntry.isDirectory()) continue;
          nestedRoots.push(path.join(scopeRoot, scopedEntry.name, 'node_modules'));
        }
        continue;
      }

      nestedRoots.push(path.join(nodeModulesRoot, entry.name, 'node_modules'));
    }
  } catch {
    return [];
  }

  return dedupeExistingPaths(nestedRoots);
}

function getNodeModulePathsForPackage(pkgRoot) {
  const topLevelRoots = dedupeExistingPaths([
    path.resolve(pkgRoot, '..', '..'),
    ...getPackagedRoots().map((root) => path.join(root, 'node_modules')),
    path.join(getAppRoot(), 'node_modules'),
  ]);

  const nestedRoots = topLevelRoots.flatMap(collectNestedNodeModulePaths);
  return dedupeExistingPaths([...topLevelRoots, ...nestedRoots]);
}

function installNodePath(extraNodePaths) {
  const currentNodePath = String(process.env.NODE_PATH || '')
    .split(path.delimiter)
    .filter(Boolean);
  const merged = Array.from(new Set([...extraNodePaths, ...currentNodePath]));
  if (!merged.length) return;
  process.env.NODE_PATH = merged.join(path.delimiter);
  Module._initPaths();
}
function resolvePackageRoot(packageParts) {
  const roots = [...getPackagedRoots(), getAppRoot()];
  for (const root of roots) {
    const pkgRoot = path.join(root, ...packageParts);
    if (isFile(path.join(pkgRoot, 'package.json'))) {
      return pkgRoot;
    }
  }
  return null;
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
  const apiPkgRoot = resolveApiPackageRoot();
  // 解压 API 到临时目录，避免子进程 asar require 问题
  const apiTempRoot = extractApiToTemp(apiPkgRoot);
  const apiNodePaths = getNodeModulePathsForPackage(apiPkgRoot);
  const appRoot = getAppRoot();
const bootstrap = `
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const logFile = process.env.RESOUND_SERVICE_LOG_FILE;
function writeLog(...parts) {
  if (!logFile) return;
  const line = '[' + new Date().toISOString() + '] ' + parts.map((part) => {
    if (part instanceof Error) return String(part.stack || part.message || part);
    if (typeof part === 'string') return part;
    try { return JSON.stringify(part); } catch { return String(part); }
  }).join(' ') + '\\n';
  try {
    fs.appendFileSync(logFile, line, 'utf8');
  } catch {}
}

(async () => {
  const pkgRoot = process.env.RESOUND_API_PKG_ROOT;
  const extraNodePaths = String(process.env.RESOUND_API_NODE_PATHS || '')
    .split(path.delimiter)
    .filter(Boolean);
  if (extraNodePaths.length) {
    // The extracted temp copy only contains the API package itself, so we
    // restore module lookup roots explicitly before requiring its entry files.
    const currentNodePath = String(process.env.NODE_PATH || '')
      .split(path.delimiter)
      .filter(Boolean);
    process.env.NODE_PATH = Array.from(new Set([...extraNodePaths, ...currentNodePath])).join(path.delimiter);
    Module._initPaths();
  }
  writeLog('[api-wrapper] boot', { pkgRoot, cwd: process.cwd(), resourcesPath: process.resourcesPath });
  const tokenFile = path.resolve(os.tmpdir(), 'anonymous_token');
  if (!fs.existsSync(tokenFile)) {
    fs.writeFileSync(tokenFile, '', 'utf8');
  }

  const generateConfig = require(path.join(pkgRoot, 'generateConfig'));
  const { serveNcmApi } = require(path.join(pkgRoot, 'server'));
  writeLog('[api-wrapper] serveNcmApi:start');
  serveNcmApi({ checkVersion: true }).catch((err) => {
    writeLog('[api-wrapper] serveNcmApi:error', err);
    console.error('[api-wrapper] serveNcmApi error:', err);
    process.exit(1);
  });

  writeLog('[api-wrapper] generateConfig:start');
  generateConfig()
    .then(() => {
      writeLog('[api-wrapper] generateConfig:done');
    })
    .catch((err) => {
      writeLog('[api-wrapper] generateConfig:error', err);
      console.error('[api-wrapper] generateConfig error:', err);
    });
})().catch((err) => {
  writeLog('[api-wrapper] startup:error', err);
  console.error('[api-wrapper] startup error:', err);
  process.exit(1);
});

if (process.stdin && !process.stdin.isTTY) {
  process.stdin.resume();
}
`.trim();

  console.log('[serviceManager] resolved api package root:', apiPkgRoot);
  writeServiceLog('[spawnNeteaseApi] resolved api package root', apiPkgRoot);

  const child = spawn(process.execPath, ['-e', bootstrap], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      CORS_ALLOW_ORIGIN: '*',
      RESOUND_API_PKG_ROOT: apiTempRoot,
      RESOUND_API_NODE_PATHS: apiNodePaths.join(path.delimiter),
      RESOUND_SERVICE_LOG_FILE: serviceLogFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    console.log(`[netease-api] ${chunk.toString().trim()}`);
    writeServiceLog('[netease-api:stdout]', chunk.toString());
  });
  child.stdout.on('error', () => {});
  child.stderr.on('data', (chunk) => {
    console.error(`[netease-api:err] ${chunk.toString().trim()}`);
    writeServiceLog('[netease-api:stderr]', chunk.toString());
  });
  child.stderr.on('error', () => {});
  child.on('exit', (code, signal) => {
    console.log(`[netease-api] exited code=${code} signal=${signal}`);
    writeServiceLog('[netease-api:exit]', { code, signal });
  });
  return child;
}

function spawnUnblockProxy(port) {
  const appPkgRoot = resolvePackageRoot(['node_modules', '@unblockneteasemusic', 'server']);
  const appRoot = getAppRoot();
  if (!appPkgRoot) {
    throw new Error('Cannot resolve @unblockneteasemusic/server package root');
  }

  const bootstrap = `
const path = require('node:path');
const pkgRoot = process.env.RESOUND_UNBLOCK_PKG_ROOT;
process.argv = [
  process.argv[0],
  path.join(pkgRoot, 'app.js'),
  '-p', process.env.RESOUND_UNBLOCK_PORT,
  '-o', 'bodian', 'kugou', 'migu', 'qq', 'bilibili',
  '-s',
];
require(path.join(pkgRoot, 'app.js'));
`.trim();

  writeServiceLog('[spawnUnblockProxy] pkgRoot', appPkgRoot);
  const child = spawn(process.execPath, ['-e', bootstrap], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ENABLE_FLAC: 'true',
      NODE_ENV: 'production',
      RESOUND_UNBLOCK_PKG_ROOT: appPkgRoot,
      RESOUND_UNBLOCK_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    console.log(`[unblock-proxy] ${chunk.toString().trim()}`);
    writeServiceLog('[unblock-proxy:stdout]', chunk.toString());
  });
  child.stdout.on('error', () => {});
  child.stderr.on('data', (chunk) => {
    console.error(`[unblock-proxy:err] ${chunk.toString().trim()}`);
    writeServiceLog('[unblock-proxy:stderr]', chunk.toString());
  });
  child.stderr.on('error', () => {});
  child.on('exit', (code, signal) => {
    console.log(`[unblock-proxy] exited code=${code} signal=${signal}`);
    writeServiceLog('[unblock-proxy:exit]', { code, signal });
  });
  return child;
}

// ── Public API ──

/**
 * Start backend services with dynamically resolved ports.
 *
 * Match 服务已收敛到 Electron 主进程内部（unblock-native-match.js），
 * 不再通过 serviceManager 启动外部 match 子进程。
 * Web 端仍通过 `npm run dev:unblock-match` 独立启动。
 *
 * @param {{ api:number, unblockProxy:number }} ports
 * @param {boolean} [skipUnblock=false]  When true, only start the Netease API (dev mode)
 * @returns {{ apiChild, proxyChild }}
 */
export function startAllServices(ports, skipUnblock = false) {
  writeServiceLog('[startAllServices]', { ports, skipUnblock, appRoot: getAppRoot(), resourcesPath: process.resourcesPath, packagedRoots: getPackagedRoots() });
  if (skipUnblock) {
    console.log(`[serviceManager] 开发模式：仅启动 Netease API (:${ports.api})`);
  } else {
    console.log(`[serviceManager] starting services:
    Netease API      → :${ports.api}
    Unblock Proxy    → :${ports.unblockProxy}`);
  }

  const apiChild = spawnNeteaseApi(ports.api);
  const proxyChild = skipUnblock ? null : spawnUnblockProxy(ports.unblockProxy);

  return { apiChild, proxyChild };
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
/**
 * 在主进程内直接启动 Netease API 服务（而非子进程），
 * 避免 ELECTRON_RUN_AS_NODE 模式下 require() 对 asar 依赖解析失败的问题。
 */
export async function startApiInProcess(port) {
  const pkgRoot = resolveApiPackageRoot();
  installNodePath(getNodeModulePathsForPackage(pkgRoot));
  writeServiceLog('[startApiInProcess] resolved api package root', pkgRoot);

  try {
    const serverPath = path.join(pkgRoot, 'server.js');
    const serverUrl = pathToFileURL(serverPath).href;
    const apiModule = await import(serverUrl);
    const { serveNcmApi } = apiModule;
    writeServiceLog('[startApiInProcess] serveNcmApi:start', { port });
    const app = await serveNcmApi({
      checkVersion: false,
      port,
    });
    writeServiceLog('[startApiInProcess] serveNcmApi:ready', { port });
    return app;
  } catch (err) {
    writeServiceLog('[startApiInProcess] error', err);
    console.error('[serviceManager] in-process API startup failed:', err);
    throw err;
  }
}
export function killAllServices(children) {
  for (const [name, child] of Object.entries(children)) {
    killProcess(name, child);
  }
}
