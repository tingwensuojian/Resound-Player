import { runDesktopBuild } from './desktop-build-utils.mjs';

const target = process.argv[2] || 'dmg';
const arch = process.argv[3] || '';

// Pass --x64 or --arm64 to electron-builder when specified
const archArg = arch ? ['--' + arch] : [];
runDesktopBuild({
  prepareScripts: ['scripts/prepare-mac-icon.mjs'],
  builderArgs: ['--mac', target, ...archArg],
});
