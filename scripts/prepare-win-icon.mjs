import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const buildDir = path.join(root, 'build');
const sourceIconCandidates = [
  path.join(buildDir, 'icon-mac.png'),
  path.join(root, 'public', 'logo.png'),
  path.join(buildDir, 'icon-win.png'),
  path.join(buildDir, 'icon.png'),
];
const sizes = [16, 20, 24, 28, 32, 40, 48, 64, 96, 128, 256];
const previewSizes = new Set([16, 32, 48, 256]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function createPng(width, height) {
  return new PNG({ width, height });
}

function getContentScale(size) {
  if (size <= 16) return 1.22;
  if (size <= 20) return 1.18;
  if (size <= 24) return 1.16;
  if (size <= 32) return 1.13;
  if (size <= 48) return 1.1;
  if (size <= 64) return 1.06;
  if (size <= 96) return 1.03;
  return 1;
}

function getSharpenAmount(size) {
  if (size <= 16) return 0.32;
  if (size <= 24) return 0.26;
  if (size <= 32) return 0.2;
  if (size <= 48) return 0.14;
  return 0;
}

function sampleBilinear(png, x, y) {
  const x0 = clamp(Math.floor(x), 0, png.width - 1);
  const y0 = clamp(Math.floor(y), 0, png.height - 1);
  const x1 = clamp(x0 + 1, 0, png.width - 1);
  const y1 = clamp(y0 + 1, 0, png.height - 1);
  const dx = clamp(x - x0, 0, 1);
  const dy = clamp(y - y0, 0, 1);

  function getPixel(px, py) {
    const index = (py * png.width + px) * 4;
    return [
      png.data[index],
      png.data[index + 1],
      png.data[index + 2],
      png.data[index + 3],
    ];
  }

  const p00 = getPixel(x0, y0);
  const p10 = getPixel(x1, y0);
  const p01 = getPixel(x0, y1);
  const p11 = getPixel(x1, y1);

  const out = [0, 0, 0, 0];
  for (let channel = 0; channel < 4; channel += 1) {
    const top = p00[channel] * (1 - dx) + p10[channel] * dx;
    const bottom = p01[channel] * (1 - dx) + p11[channel] * dx;
    out[channel] = Math.round(top * (1 - dy) + bottom * dy);
  }
  return out;
}

function resizeForSize(source, size) {
  const output = createPng(size, size);
  const contentScale = getContentScale(size);
  const srcWidth = source.width / contentScale;
  const srcHeight = source.height / contentScale;
  const offsetX = (source.width - srcWidth) / 2;
  const offsetY = (source.height - srcHeight) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const srcX = offsetX + ((x + 0.5) * srcWidth) / size - 0.5;
      const srcY = offsetY + ((y + 0.5) * srcHeight) / size - 0.5;
      const [r, g, b, a] = sampleBilinear(source, srcX, srcY);
      const index = (y * size + x) * 4;
      output.data[index] = r;
      output.data[index + 1] = g;
      output.data[index + 2] = b;
      output.data[index + 3] = a;
    }
  }

  return applySharpen(output, getSharpenAmount(size));
}

function applySharpen(png, amount) {
  if (amount <= 0) return png;

  const result = createPng(png.width, png.height);
  result.data.set(png.data);
  const kernel = [
    1, 2, 1,
    2, 4, 2,
    1, 2, 1,
  ];
  const kernelWeight = 16;

  for (let y = 1; y < png.height - 1; y += 1) {
    for (let x = 1; x < png.width - 1; x += 1) {
      const index = (y * png.width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        let blurred = 0;
        let kernelIndex = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const srcIndex = ((y + ky) * png.width + (x + kx)) * 4 + channel;
            blurred += png.data[srcIndex] * kernel[kernelIndex];
            kernelIndex += 1;
          }
        }
        blurred /= kernelWeight;
        const original = png.data[index + channel];
        result.data[index + channel] = clamp(
          Math.round(original + (original - blurred) * amount),
          0,
          255,
        );
      }
    }
  }

  return result;
}

function pngToIcoBmp(png) {
  const rowBytes = png.width * 4;
  const andRowBytes = Math.ceil(png.width / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(png.width, 4);
  header.writeInt32LE(png.height * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);

  const xor = Buffer.alloc(rowBytes * png.height);
  for (let y = 0; y < png.height; y += 1) {
    const destRow = png.height - 1 - y;
    for (let x = 0; x < png.width; x += 1) {
      const srcIndex = (y * png.width + x) * 4;
      const destIndex = (destRow * png.width + x) * 4;
      xor[destIndex] = png.data[srcIndex + 2];
      xor[destIndex + 1] = png.data[srcIndex + 1];
      xor[destIndex + 2] = png.data[srcIndex];
      xor[destIndex + 3] = png.data[srcIndex + 3];
    }
  }

  return Buffer.concat([header, xor, Buffer.alloc(andRowBytes * png.height, 0)]);
}

const sourceIcon = sourceIconCandidates.find((candidate) => fs.existsSync(candidate));

if (!sourceIcon) {
  console.error('Missing Windows icon source. Expected one of:');
  for (const candidate of sourceIconCandidates) {
    console.error('- ' + path.relative(root, candidate));
  }
  process.exit(1);
}

const sourcePng = readPng(sourceIcon);
if (sourcePng.width < 512 || sourcePng.height < 512) {
  console.warn(
    'Warning: ' + path.relative(root, sourceIcon) + ' is ' + sourcePng.width + 'x' + sourcePng.height +
    '; Windows icons look best from a 1024x1024 source.',
  );
}

const entries = sizes.map((size) => {
  const resized = resizeForSize(sourcePng, size);
  const pngBuffer = PNG.sync.write(resized);

  if (previewSizes.has(size)) {
    fs.writeFileSync(path.join(buildDir, 'icon-preview-' + size + '.png'), pngBuffer);
  }

  if (size === 256) {
    return { width: size, height: size, data: pngBuffer };
  }

  return { width: size, height: size, data: pngToIcoBmp(resized) };
});

fs.writeFileSync(path.join(buildDir, 'icon-win.png'), fs.readFileSync(sourceIcon));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);

const directoryEntries = [];
let offset = header.length + entries.length * 16;
for (const entry of entries) {
  const dir = Buffer.alloc(16);
  dir.writeUInt8(entry.width >= 256 ? 0 : entry.width, 0);
  dir.writeUInt8(entry.height >= 256 ? 0 : entry.height, 1);
  dir.writeUInt8(0, 2);
  dir.writeUInt8(0, 3);
  dir.writeUInt16LE(1, 4);
  dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(entry.data.length, 8);
  dir.writeUInt32LE(offset, 12);
  offset += entry.data.length;
  directoryEntries.push(dir);
}

const ico = Buffer.concat([header, ...directoryEntries, ...entries.map((entry) => entry.data)]);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(buildDir, 'icon-win.ico'), ico);

console.log(
  'Generated icon.ico and icon-win.ico from ' +
  path.relative(root, sourceIcon) +
  ' with adaptive small-size optimization (' + sizes.length + ' sizes)',
);
