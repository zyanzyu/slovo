#!/usr/bin/env node
/**
 * Recreates the large runtime assets that are intentionally excluded from Git.
 *
 * - Piper phonemizer + ONNX Runtime WASM come from npm packages.
 * - The 63 MB Russian voice is downloaded from the public Piper mirror and
 *   verified by SHA-256 before it is written into public/tts.
 *
 * Usage: npm run tts:prepare
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tts = path.join(root, 'public', 'tts');
const modelDir = path.join(tts, 'ru', 'ru_RU', 'irina', 'medium');
const ortDir = path.join(tts, 'ort');

const MODEL = {
  name: 'ru_RU-irina-medium.onnx',
  sha256: '8ff38212d23da300bbe3705c645e6e5b9475f0bfde01558eb17813e22acaaaaa',
  urls: [
    'https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx',
    'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx',
  ],
};
const MODEL_JSON = {
  name: 'ru_RU-irina-medium.onnx.json',
  sha256: 'c2ec28bb38e2b59e93b959b3e40348c1afebbd272f30fed5d41205d08e98a9d7',
  urls: [
    'https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json?download=1',
    'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json',
  ],
};

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfPresent(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`缺少 ${path.relative(root, source)}；请先运行 npm install。`);
  }
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
  console.log(`copied ${path.relative(root, destination)} (${fs.statSync(destination).size} bytes)`);
}

async function download(asset, destination) {
  if (fs.existsSync(destination) && sha256(destination) === asset.sha256) {
    console.log(`ok ${path.relative(root, destination)}`);
    return;
  }
  ensureDir(path.dirname(destination));
  let lastError;
  for (const url of asset.urls) {
    try {
      console.log(`downloading ${url}`);
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== asset.sha256) {
        throw new Error(`SHA-256 mismatch: ${hash} != ${asset.sha256} (可能是镜像返回 HTML)`);
      }
      fs.writeFileSync(destination, bytes);
      console.log(`wrote ${path.relative(root, destination)} (${bytes.length} bytes)`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`failed: ${error.message}`);
    }
  }
  throw new Error(`无法下载 ${asset.name}: ${lastError?.message || 'unknown error'}`);
}

ensureDir(modelDir);
ensureDir(ortDir);

copyIfPresent(
  path.join(root, 'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data'),
  path.join(tts, 'piper_phonemize.data'),
);
copyIfPresent(
  path.join(root, 'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm'),
  path.join(tts, 'piper_phonemize.wasm'),
);
copyIfPresent(
  path.join(root, 'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.js'),
  path.join(tts, 'piper_phonemize.js'),
);
copyIfPresent(
  path.join(root, 'node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm'),
  path.join(ortDir, 'ort-wasm-simd.wasm'),
);
copyIfPresent(
  path.join(root, 'node_modules/onnxruntime-web/dist/ort-wasm.wasm'),
  path.join(ortDir, 'ort-wasm.wasm'),
);

await download(MODEL_JSON, path.join(modelDir, MODEL_JSON.name));
await download(MODEL, path.join(modelDir, MODEL.name));

console.log('TTS assets ready. Model card/license: docs/THIRD_PARTY_TTS.md');
