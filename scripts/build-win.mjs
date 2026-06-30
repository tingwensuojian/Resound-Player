import { runDesktopBuild, buildRenderer, runElectronBuilder, runNodeScript, cleanDesktopDist } from './desktop-build-utils.mjs';
import { rcedit } from 'rcedit';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2] || 'nsis';
const root = process.cwd();
const distDir = path.join(root, 'dist-build');
const iconPath = path.join(root, 'build', 'icon.ico');
const exePath = path.join(distDir, 'win-unpacked', 'Resound-Player.exe');

async function main() {
  // Step 1: Prepare icons, build renderer, build unpacked
  runDesktopBuild({
    prepareScripts: ['scripts/prepare-win-icon.mjs'],
    builderArgs: ['--win', 'dir'],
  });

  // Step 2: Apply icon to inner exe
  if (fs.existsSync(iconPath) && fs.existsSync(exePath)) {
    await rcedit(exePath, { icon: iconPath });
    console.log('  ✓ Icon applied to win-unpacked/Resound-Player.exe');
  } else {
    console.error('Icon or exe not found');
    process.exit(1);
  }

  // Step 3: Build the actual target from prepackaged
  // In CI, explicitly disable auto-publish to avoid GH_TOKEN errors
  const publishArgs = process.env.CI ? ['--publish', 'never'] : [];
  console.log(`\n=== Building target: ${target} from prepackaged ===`);
  runElectronBuilder(['--win', target, '--prepackaged', path.join(distDir, 'win-unpacked'), ...publishArgs]);
  console.log(`\n✓ Build complete: ${target}`);
}

main().catch((err) => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
