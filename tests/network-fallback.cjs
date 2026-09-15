const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}});let analyzeCalls=0;
  await page.route('**/api/ai/analyze',route=>{analyzeCalls++;return route.abort('failed');});
  await page.route('**/api/ai/image',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'photo',detail:'clean',content_bbox:{x:0,y:0,w:1000,h:1000},exclude_regions:[],semantic:{confidence:0,source_label_count:0,vertices:[],edges:[],auxiliaries:[],annotations:[]}})}));
  await page.goto('http://127.0.0.1:4173');await page.locator('#demo').click();await page.waitForFunction(()=>!document.querySelector('#start').disabled);await page.locator('#start').click();await page.waitForFunction(()=>!document.querySelector('#start').disabled,null,{timeout:120000});
  assert.equal(analyzeCalls,3);assert.equal(await page.locator('#badge').textContent(),'本地识别完成');assert(+(await page.locator('#count').textContent())>0);assert(!/Unknown error/i.test(await page.locator('#status').textContent()));
  console.log('PASS: three network failures fall back to local OCR instead of ending with zero results.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
