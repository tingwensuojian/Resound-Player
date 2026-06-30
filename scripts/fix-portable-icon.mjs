import { rcedit } from 'rcedit';
import { path7za } from '7zip-bin';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const distDir = path.join(root, 'dist-build');

async function fixPortableIcon() {
  if (!fs.existsSync(distDir)) {
    console.log('dist-build directory not found, skipping icon fix.');
    return;
  }

  const files = fs.readdirSync(distDir)
    .filter(f => f.endsWith('.exe') && !f.includes('Setup') && !f.includes('win-unpacked') && !f.includes('-fixed'));

  if (files.length === 0) {
    console.log('No portable exe found, skipping icon fix.');
    return;
  }

  const portableBasename = files[0];
  const portableExe = path.join(distDir, portableBasename);
  const fixedBasename = portableBasename.replace('.exe', '-fixed.exe');
  const fixedExe = path.join(distDir, fixedBasename);
  const innerExe = path.join(distDir, 'win-unpacked', 'Resound-Player.exe');
  const iconPath = path.join(root, 'build', 'icon.ico');
  const tempDir = path.join(root, '.tmp-icon-fix');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const sfxModule = path.join(tempDir, 'sfx.bin');
  const newArchive = path.join(tempDir, 'archive.7z');

  if (!fs.existsSync(iconPath)) { console.error('Icon file not found at:', iconPath); return; }
  if (!fs.existsSync(innerExe)) { console.log('win-unpacked/Resound-Player.exe not found, skipping.'); return; }

  try {
    console.log('Applying icon to inner exe...');
    await rcedit(innerExe, { icon: iconPath });
    console.log('  -> Icon applied');

    console.log('Extracting SFX module...');
    const portableData = fs.readFileSync(portableExe);
    const sig7z = Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]);
    const sfxEnd = portableData.indexOf(sig7z);
    if (sfxEnd === -1) throw new Error('Could not find 7z signature in portable exe');
    fs.writeFileSync(sfxModule, portableData.subarray(0, sfxEnd));
    console.log('  -> SFX module extracted (%d bytes)', sfxEnd);

    console.log('Creating new 7z archive from win-unpacked/...');
    const winUnpackedDir = path.join(distDir, 'win-unpacked');
    execFileSync(path7za, [
      'a', '-mx=9', '-m0=LZMA2:26', '-m1=LZMA:20', '-m2=BCJ2',
      '-ms=on', '-bd', newArchive, '*'
    ], { cwd: winUnpackedDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
    console.log('  -> New 7z archive created');

    console.log('Assembling new portable exe...');
    const sfxData = fs.readFileSync(sfxModule);
    const archiveData = fs.readFileSync(newArchive);
    fs.writeFileSync(fixedExe, Buffer.concat([sfxData, archiveData]));
    console.log('  -> New portable exe written to: ' + path.relative(root, fixedExe));

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

    console.log('\nDone. Portable icon fix complete.');
    console.log('');
    console.log('NOTE: Original file was locked, so a new file was created.');
    console.log('Replace the old file with the new one:');
    console.log('  1. Close dist-build folder in Explorer');
    console.log('  2. Delete the old "' + portableBasename + '"');
    console.log('  3. Rename "' + fixedBasename + '" to "' + portableBasename + '"');
  } catch (err) {
    console.error('Icon fix failed:', err.message);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    process.exitCode = 1;
  }
}

fixPortableIcon();
