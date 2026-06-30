import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const buildDir = path.join(root, 'build');
const premadeDir = path.join(buildDir, 'premade-icons');

if (!fs.existsSync(premadeDir)) {
  console.error('Premade icons directory not found at: ' + path.relative(root, premadeDir));
  console.error('Expected files: logo.ico, logo_512x512.png, etc.');
  console.error('Run: Copy premade icons into build/premade-icons/ first.');
  process.exit(1);
}

// ── Copy icon.ico (Windows electron-builder + extraResources) ─────
const icoSrc = path.join(premadeDir, 'logo.ico');
const icoDst = path.join(buildDir, 'icon.ico');
const icoWinDst = path.join(buildDir, 'icon-win.ico');
if (!fs.existsSync(icoSrc)) {
  console.error('Missing: premade-icons/logo.ico');
  process.exit(1);
}
fs.copyFileSync(icoSrc, icoDst);
fs.copyFileSync(icoSrc, icoWinDst);

// ── Copy a high-res PNG for fallback (icon-win.png) ───────────────
const pngHighRes = path.join(premadeDir, 'logo_512x512.png');
const pngDst = path.join(buildDir, 'icon-win.png');
if (fs.existsSync(pngHighRes)) {
  fs.copyFileSync(pngHighRes, pngDst);
} else {
  // Fallback: use the largest PNG available
  const pngs = fs.readdirSync(premadeDir)
    .filter((f) => f.startsWith('logo_') && f.endsWith('.png'))
    .sort()
    .reverse();
  if (pngs.length > 0) {
    fs.copyFileSync(path.join(premadeDir, pngs[0]), pngDst);
  } else {
    console.warn('No high-res PNG found in premade-icons; skpping icon-win.png');
  }
}

const icoSize = (fs.statSync(icoDst).size / 1024).toFixed(1);
console.log(
  'Copied premade icons to build/:' +
  '\n  icon.ico / icon-win.ico  ← premade-icons/logo.ico  (' + icoSize + ' KB)' +
  '\n  icon-win.png            ← premade-icons/logo_512x512.png',
);
