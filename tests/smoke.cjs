const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const JSZip = require('jszip');

(async () => {
  const root = path.resolve(__dirname, '..');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'slidecraft-smoke-'));
  const port = process.env.TEST_PORT || '4175';
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: root, env: {...process.env, PORT: port, SILICONFLOW_API_KEY: '', AI_API_KEY: '', AI_PROVIDER: 'api'}, stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser;
  let output = '';
  server.stdout.on('data', chunk => output += chunk);
  server.stderr.on('data', chunk => output += chunk);
  try {
    await Promise.race([
      once(server.stdout, 'data'),
      once(server, 'exit').then(() => {throw Error(`Server failed: ${output}`);}),
      new Promise((_, reject) => setTimeout(() => reject(Error('Server startup timeout')), 10000).unref())
    ]);
    assert.equal((await fetch(`${base}/.env`)).status, 403);
    const templates = await (await fetch(`${base}/api/templates`)).json();
    assert(templates.templates.includes('default-template.pptx'));
    for (const resource of ['/vendor/jszip.min.js', '/vendor/tesseract.min.js', '/vendor/ocr/worker.min.js', '/vendor/ocr/chi_sim.traineddata.gz', '/vendor/ocr/eng.traineddata.gz', '/assets/watermark.png']) {
      const response = await fetch(base + resource);
      assert.equal(response.status, 200, resource);
      assert((await response.arrayBuffer()).byteLength > 100, resource);
    }
    browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true});
    const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
    const errors = [], external = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {if(response.status() === 404)missing.push(response.url());});
    await page.route('**/*', route => {
      const url = route.request().url();
      if(url.startsWith('http') && !url.startsWith(base + '/')) {external.push(url); return route.abort();}
      return route.continue();
    });
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#slideSelect').options[0]?.textContent === '第 1 页');
    await page.locator('#demo').click();
    await page.locator('#start').click();
    await page.waitForFunction(() => ['本地识别完成', '识别失败'].includes(document.querySelector('#badge').textContent), null, {timeout: 120000});
    const status = await page.locator('#status').textContent();
    console.log(status);
    assert.equal(await page.locator('#badge').textContent(), '本地识别完成', status);
    assert(await page.locator('#regions textarea').count() > 0, 'Real OCR text missing');
    assert(await page.locator('#regions .image-info img').count() > 0, 'Line image missing');
    const values = await page.locator('#regions textarea').evaluateAll(els => els.map(el => el.value));
    assert.match(values.join(' '), /MAKE|IDEAS|EDITABLE|screenshot/i, 'OCR did not recognize demo text');
    console.log('OCR:', values);
    await page.locator('#regions textarea').first().fill('1. 已知 $AB=3$，求 $x^2$。');
    await page.locator('#preview').click();
    await page.waitForFunction(() => !document.querySelector('#export').disabled, null, {timeout: 30000});
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadPromise;
    const pptPath = path.join(temp, 'result.pptx');
    await download.saveAs(pptPath);
    const original = await JSZip.loadAsync(await fs.readFile(path.join(root, 'demo-template.pptx')));
    const result = await JSZip.loadAsync(await fs.readFile(pptPath));
    const slide = await result.file('ppt/slides/slide1.xml').async('string');
    assert.match(slide, /已知/);
    assert.match(slide, /m:oMath/);
    assert.match(slide, /<p:pic>/);
    for (const [name, file] of Object.entries(original.files)) {
      if (file.dir || name === 'ppt/slides/slide1.xml' || name === 'ppt/slides/_rels/slide1.xml.rels' || name === '[Content_Types].xml') continue;
      assert(result.file(name), `Template part removed: ${name}`);
      assert.deepEqual(await result.file(name).async('nodebuffer'), await file.async('nodebuffer'), name);
    }
    if (process.env.TEST_OUTPUT_DIR) {
      await fs.mkdir(process.env.TEST_OUTPUT_DIR, {recursive: true});
      await fs.copyFile(pptPath, path.join(process.env.TEST_OUTPUT_DIR, 'Slidecraft-local-test.pptx'));
      await page.locator('#previewCanvas').screenshot({path: path.join(process.env.TEST_OUTPUT_DIR, 'local-preview.png')});
      await page.screenshot({path: path.join(process.env.TEST_OUTPUT_DIR, 'local-workspace.png'), fullPage: true});
    }
    await page.locator('#regions textarea').first().fill('修改后需要重新预览');
    assert(await page.locator('#export').isDisabled());
    await page.locator('#reset').click();
    assert.equal(await page.locator('#count').textContent(), '0');
    assert.equal(await page.locator('#slideSelect').inputValue(), '0');
    assert.deepEqual(errors, [], 'Browser errors');
    assert.deepEqual(missing, [], 'Missing local resources');
    assert.deepEqual(external, [], 'Local flow requested external resources');
    console.log('PASS: local resources, real OCR, line art, editable text/math, PPTX download, template preservation, preview invalidation and reset.');
  } finally {
    await browser?.close();
    server.kill();
    await fs.rm(temp, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
