import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'dist-build');

export function cleanDesktopDist() {
  try {
    // 尝试使用rmSync删除，如果失败则尝试其他方法
    fs.rmSync(outputDir, { recursive: true, force: true });
  } catch (err) {
    console.warn('使用rmSync删除失败，尝试其他方法:', err.message);
    
    // 如果rmSync失败，尝试使用命令行删除
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      // Windows平台使用rd命令
      spawnSync('cmd', ['/c', 'rd', '/s', '/q', outputDir], {
        cwd: root,
        stdio: 'ignore',
        shell: true
      });
    } else {
      // Unix平台使用rm命令
      spawnSync('rm', ['-rf', outputDir], {
        cwd: root,
        stdio: 'ignore'
      });
    }
    
    // 检查目录是否仍然存在
    if (fs.existsSync(outputDir)) {
      console.warn('目录仍然存在，可能需要手动清理:', outputDir);
    }
  }
}

export function runCommand(command, args, options = {}) {
  // Windows平台特殊处理
  const isWindows = process.platform === 'win32';
  const shell = isWindows ? true : false;
  
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: shell,
    env: {
      ...process.env,
      ELECTRON_CACHE: path.join(root, '.electron-cache'),
      ELECTRON_BUILDER_CACHE: path.join(root, '.electron-builder-cache'),
      ...options.env,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
  }

  if (result.signal) {
    throw new Error(`${command} ${args.join(' ')} was terminated by signal ${result.signal}`);
  }
}

export function buildRenderer() {
  runCommand('npm', ['run', 'build:renderer']);
}

export function runElectronBuilder(args) {
  runCommand('npx', ['electron-builder', ...args]);
}

export function runNodeScript(scriptPath) {
  runCommand('node', [scriptPath]);
}

function collectMacAppBundles(dir) {
  if (!fs.existsSync(dir)) return [];

  const results = [];
  const queue = [dir];

  while (queue.length > 0) {
    const current = queue.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (!entry.isDirectory()) continue;

      if (entry.name.endsWith('.app')) {
        results.push(fullPath);
        continue;
      }

      queue.push(fullPath);
    }
  }

  return results;
}

function postprocessMacBundles() {
  if (process.platform !== 'darwin') return;

  const appBundles = collectMacAppBundles(outputDir);
  for (const appBundle of appBundles) {
    runCommand('xattr', ['-cr', appBundle]);
    runCommand('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appBundle]);
    runCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appBundle]);
  }
}

export function runDesktopBuild({ builderArgs, prepareScripts = [] }) {
  cleanDesktopDist();

  const publishArgs = process.env.CI ? ['--publish', 'never'] : [];

  for (const script of prepareScripts) {
    runNodeScript(script);
  }

  buildRenderer();
  runElectronBuilder([...builderArgs, ...publishArgs]);
  postprocessMacBundles();
}
