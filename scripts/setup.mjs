import {copyFile, mkdir, readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const packageRoot = name => path.dirname(require.resolve(`${name}/package.json`));
const copy = (source, target) => copyFile(source, path.join(root, target));
await mkdir(path.join(root, 'vendor/ocr'), {recursive: true});
await mkdir(path.join(root, 'templates'), {recursive: true});
try {
  await copy(path.join(packageRoot('jszip'), 'dist/jszip.min.js'), 'vendor/jszip.min.js');
  const tesseract = packageRoot('tesseract.js');
  await copy(path.join(tesseract, 'dist/tesseract.min.js'), 'vendor/tesseract.min.js');
  await copy(path.join(tesseract, 'dist/worker.min.js'), 'vendor/ocr/worker.min.js');
  const core = packageRoot('tesseract.js-core');
  for (const file of await readdir(core)) {
    if (/\.wasm(?:\.js)?$/.test(file)) await copy(path.join(core, file), `vendor/ocr/${file}`);
  }
  for (const lang of ['chi_sim', 'eng']) {
    await copy(path.join(packageRoot(`@tesseract.js-data/${lang}`), '4.0.0', `${lang}.traineddata.gz`), `vendor/ocr/${lang}.traineddata.gz`);
  }
  await copy(path.join(packageRoot('jszip'), 'LICENSE.markdown'), 'vendor/JSZip-LICENSE.md');
  await copy(path.join(tesseract, 'LICENSE.md'), 'vendor/Tesseract-LICENSE.md');
  await copy(path.join(core, 'LICENSE'), 'vendor/Tesseract-core-LICENSE');
} catch (error) {
  throw new Error('本地依赖准备失败，请先运行 pnpm install 或 npm install。', {cause: error});
}
try {
  await copyFile(path.join(root, 'demo-template.pptx'), path.join(root, 'templates/default-template.pptx'), constants.COPYFILE_EXCL);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
console.log('本地依赖已就绪：JSZip、中英文 OCR、WASM 和默认模板。已有默认模板保持不变。');
