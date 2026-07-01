import { runDesktopBuild } from './desktop-build-utils.mjs';

const targets = (process.argv[2] || 'dmg').split(',').map(t => t.trim()).filter(Boolean);
const arch = process.argv[3] || '';

// Pass --x64 or --arm64 to electron-builder when specified
const archArg = arch ? ['--' + arch] : [];
const targetArgs = targets.flatMap(t => ['--mac', t]);
runDesktopBuild({
  prepareScripts: ['scripts/prepare-mac-icon.mjs'],
  builderArgs: [...targetArgs, ...archArg],
});
