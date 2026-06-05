import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const buildDir = path.join(root, 'build');
const sourceIconCandidates = [
  path.join(buildDir, 'icon-mac.png'),
  path.join(root, 'public', 'logo.png'),
  path.join(buildDir, 'icon.png'),
];
const iconsetDir = path.join(buildDir, 'icon.iconset');
const outputIcon = path.join(buildDir, 'icon.icns');

if (process.platform !== 'darwin') {
  console.error('macOS icon generation requires macOS built-in tools: sips and iconutil.');
  console.error('Please run npm run dist:mac on a Mac, or provide build/icon.icns manually.');
  process.exit(1);
}

const sourceIcon = sourceIconCandidates.find((candidate) => fs.existsSync(candidate));

if (!sourceIcon) {
  console.error('Missing macOS icon source. Expected one of:');
  for (const candidate of sourceIconCandidates) {
    console.error(`- ${path.relative(root, candidate)}`);
  }
  process.exit(1);
}

if (fs.existsSync(outputIcon) && !process.env.RESOUND_FORCE_REBUILD_MAC_ICON) {
  const sourceMtime = fs.statSync(sourceIcon).mtimeMs;
  const outputMtime = fs.statSync(outputIcon).mtimeMs;
  if (outputMtime >= sourceMtime) {
    console.log(`Using existing ${path.relative(root, outputIcon)}.`);
    process.exit(0);
  }
}

const sourceInfo = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', sourceIcon], {
  encoding: 'utf8',
});
const sourceWidth = Number(sourceInfo.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0);
const sourceHeight = Number(sourceInfo.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 0);

if (sourceWidth < 1024 || sourceHeight < 1024) {
  console.warn(
    `Warning: ${path.relative(root, sourceIcon)} is ${sourceWidth}x${sourceHeight}; macOS icons look best from a 1024x1024 source.`,
  );
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
