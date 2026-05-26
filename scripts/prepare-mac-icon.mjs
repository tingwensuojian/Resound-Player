import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const buildDir = path.join(root, 'build');
const sourceIcon = path.join(buildDir, 'icon.png');
const iconsetDir = path.join(buildDir, 'icon.iconset');
const outputIcon = path.join(buildDir, 'icon.icns');

if (process.platform !== 'darwin') {
  console.error('macOS icon generation requires macOS built-in tools: sips and iconutil.');
  console.error('Please run npm run dist:mac on a Mac, or provide build/icon.icns manually.');
  process.exit(1);
}

if (fs.existsSync(outputIcon) && !process.env.RESOUND_FORCE_REBUILD_MAC_ICON) {
  console.log(`Using existing ${path.relative(root, outputIcon)}.`);
  process.exit(0);
}

if (!fs.existsSync(sourceIcon)) {
  console.error('Missing build/icon.png. Please copy the app PNG icon to build/icon.png first.');
  process.exit(1);
}

fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });

const sizes = [16, 32, 128, 256, 512];

for (const size of sizes) {
  const normalOutput = path.join(iconsetDir, `icon_${size}x${size}.png`);
  execFileSync('sips', ['-z', String(size), String(size), sourceIcon, '--out', normalOutput], {
    stdio: 'inherit',
  });

  const retinaSize = size * 2;
  const retinaOutput = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);
  execFileSync('sips', ['-z', String(retinaSize), String(retinaSize), sourceIcon, '--out', retinaOutput], {
    stdio: 'inherit',
  });
}

execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcon], { stdio: 'inherit' });
fs.rmSync(iconsetDir, { recursive: true, force: true });

console.log(`Generated ${path.relative(root, outputIcon)} on ${os.platform()}.`);
