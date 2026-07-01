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

  // Step 2.5: Ensure app-update.yml exists in win-unpacked/resources/
  // electron-builder with --publish never skips generating app-update.yml,
  // which causes electron-updater's downloadUpdate() to fail with ENOENT.
  // We create it manually so it gets included in the NSIS installer.
  const resourcesDir = path.join(distDir, 'win-unpacked', 'resources');
  const appUpdateYmlPath = path.join(resourcesDir, 'app-update.yml');
  if (!fs.existsSync(appUpdateYmlPath)) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    const updaterCacheDirName = 'resound-player-updater';
    const configLines = [
      'provider: ' + pkg.build.publish.provider,
      'owner: ' + pkg.build.publish.owner,
      'repo: ' + pkg.build.publish.repo,
      'updaterCacheDirName: ' + updaterCacheDirName,
    ];
    fs.writeFileSync(appUpdateYmlPath, configLines.join('\n') + '\n', 'utf-8');
    console.log('  \u2713 Generated app-update.yml in win-unpacked/resources');
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
