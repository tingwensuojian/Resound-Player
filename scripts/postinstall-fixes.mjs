import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cloudImportPath = path.join(
  root,
  'node_modules',
  '@neteasecloudmusicapienhanced',
  'api',
  'module',
  'cloud_import.js',
);

function applyCloudImportDuplicateGuard(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[postinstall-fixes] Skip missing file: ${filePath}`);
    return;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes("body: { code: 200, duplicate: true, message: '文件已在云盘' }")) {
    console.log('[postinstall-fixes] cloud_import duplicate guard already applied');
    return;
  }

  const marker = "  //res.body.data[0].upload 0:文件可导入,1:文件已在云盘,2:不能导入";
  const oldSongIdLine = "        songId: res.body.data[0].songId,";
  if (!source.includes(marker) || !source.includes(oldSongIdLine)) {
    throw new Error('[postinstall-fixes] cloud_import.js format changed; duplicate guard patch needs review');
  }

  let next = source.replace(marker, `  //res.body.data[0].upload 0:文件可导入,1:文件已在云盘,2:不能导入
  const checkItem = res.body.data?.[0]
  if (!checkItem) {
    return {
      status: 400,
      body: { code: 400, message: '上传检查失败，请稍后重试' },
      cookie: res.cookie,
    }
  }
  const uploadFlag = checkItem.upload
  if (uploadFlag === 1) {
    return {
      status: 200,
      body: { code: 200, duplicate: true, message: '文件已在云盘' },
      cookie: res.cookie,
    }
  }
  if (uploadFlag === 2) {
    return {
      status: 400,
      body: { code: 400, message: '该文件不能导入云盘' },
      cookie: res.cookie,
    }
  }`);
  next = next.replace(oldSongIdLine, "        songId: checkItem.songId,");

  fs.writeFileSync(filePath, next, 'utf8');
  console.log('[postinstall-fixes] Applied cloud_import duplicate guard');
}

applyCloudImportDuplicateGuard(cloudImportPath);
