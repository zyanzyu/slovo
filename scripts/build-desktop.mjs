import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2] || 'linux';
const arch = process.argv[3] || process.arch;
const electronVersion = process.env.SLOVO_ELECTRON_VERSION || '31.7.7';
const appVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

if (!['linux', 'win32'].includes(platform)) {
  throw new Error(`Unsupported desktop platform: ${platform}`);
}
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  throw new Error('dist/index.html is missing; run `npm run build` first');
}

const releaseDir = path.join(root, 'release');
const stage = path.join(releaseDir, 'desktop-stage');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

for (const entry of ['dist', 'server']) {
  fs.cpSync(path.join(root, entry), path.join(stage, entry), { recursive: true });
}
fs.cpSync(path.join(root, 'desktop', 'main.mjs'), path.join(stage, 'desktop', 'main.mjs'));
fs.cpSync(path.join(root, 'server.mjs'), path.join(stage, 'server.mjs'));
fs.writeFileSync(
  path.join(stage, 'README.md'),
  fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(
    '完整构建、测试证据、校验和与已知限制见：[`release/VERIFICATION.md`](release/VERIFICATION.md)。',
    '完整构建、测试证据、校验和与已知限制见项目发布目录中的 `VERIFICATION.md`。',
  ),
);

fs.writeFileSync(
  path.join(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'slovo',
      productName: 'СЛОВО',
      version: appVersion,
      description: 'СЛОВО — 俄语单词提背',
      main: 'desktop/main.mjs',
      type: 'module',
      private: true,
      author: 'СЛОВО',
      license: 'MIT',
    },
    null,
    2,
  ),
);

const icon = path.join(root, platform === 'win32' ? 'build/icon.ico' : 'dist/icons/icon-512.png');
console.log(`PACKAGER_START ${platform}/${arch} electron=${electronVersion}`);
const [appDir] = await packager({
  dir: stage,
  name: 'Slovo',
  executableName: 'Slovo',
  platform,
  arch,
  out: releaseDir,
  overwrite: true,
  asar: false,
  prune: false,
  quiet: true,
  icon,
  appVersion,
  appCopyright: 'СЛОВО',
  electronVersion,
  ...(process.env.SLOVO_ELECTRON_ZIPS ? { electronZipDir: process.env.SLOVO_ELECTRON_ZIPS } : {}),
  win32metadata: {
    CompanyName: 'SLOVO',
    FileDescription: 'СЛОВО — 俄语单词提背',
    ProductName: 'СЛОВО',
    OriginalFilename: 'Slovo.exe',
  },
});
console.log(`PACKAGER_DONE ${appDir}`);

if (platform === 'linux') {
  // Portable Electron archives cannot preserve a root-owned 4755 chrome-sandbox
  // when extracted by a normal user. Use a small launcher so `./Slovo` is
  // runnable from any directory; the local app only loads bundled content.
  const realBinary = path.join(appDir, 'Slovo-bin');
  fs.renameSync(path.join(appDir, 'Slovo'), realBinary);
  const launcher = path.join(appDir, 'Slovo');
  fs.writeFileSync(
    launcher,
    '#!/bin/sh\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$DIR/Slovo-bin" --no-sandbox "$@"\n',
    { mode: 0o755 },
  );
  fs.chmodSync(realBinary, 0o755);
  fs.chmodSync(launcher, 0o755);
}

const folderName = path.basename(appDir);
const suffix = platform === 'win32' ? 'windows' : 'linux';
const archiveBase = `SLOVO-${suffix}-${arch}`;
const archivePath = path.join(releaseDir, archiveBase);

if (platform === 'win32') {
  fs.rmSync(`${archivePath}.zip`, { force: true });
  execFileSync(
    'python3',
    [
      '-c',
      [
        'import shutil, sys',
        `shutil.make_archive(sys.argv[1], "zip", root_dir=sys.argv[2], base_dir=sys.argv[3])`,
      ].join('\n'),
      archivePath,
      releaseDir,
      folderName,
    ],
    { stdio: 'inherit' },
  );
  console.log(`PACKAGED ${archivePath}.zip`);
} else {
  fs.rmSync(`${archivePath}.tar.gz`, { force: true });
  // GNU tar intermittently fails with ENOSYS under the proot used by the
  // Android-hosted build container; Python's tarfile is equivalent and stable.
  execFileSync('python3', [
    '-c',
    [
      'import os, sys, tarfile',
      'archive, root, folder = sys.argv[1:4]',
      'with tarfile.open(archive, "w:gz") as t:',
      '    t.add(os.path.join(root, folder), arcname=folder, recursive=True)',
    ].join('\n'),
    `${archivePath}.tar.gz`,
    releaseDir,
    folderName,
  ], { stdio: 'inherit' });
  console.log(`PACKAGED ${archivePath}.tar.gz`);
}

console.log(`APP_DIR ${appDir}`);
