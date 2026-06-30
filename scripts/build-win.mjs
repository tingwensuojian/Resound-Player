import { runDesktopBuild } from './desktop-build-utils.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2] || 'nsis';

runDesktopBuild({
  prepareScripts: ['scripts/prepare-win-icon.mjs'],
  builderArgs: ['--win', target],
});

// After building portable, run the icon fix to apply custom icon to inner exe
if (target === 'portable') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fixScript = path.join(__dirname, 'fix-portable-icon.mjs');
  const result = spawnSync('node', [fixScript], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0) {
    console.warn('Portable icon fix completed with warnings (non-critical).');
  }
}
