// Optional check against a real screenshot: set SCREENSHOT_PATH before running.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');

(async()=>{
  assert(process.env.SCREENSHOT_PATH,'SCREENSHOT_PATH is required');
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    await page.goto('http://127.0.0.1:4173');
    await page.waitForFunction(()=>!document.querySelector('#templateCatalog').disabled);
    await page.locator('#imageInput').setInputFiles(process.env.SCREENSHOT_PATH);
    await page.waitForFunction(()=>document.querySelector('#imageStatus').textContent.includes('已载入'));
    await page.locator('#start').click();
    await page.waitForFunction(()=>!document.querySelector('#start').disabled,null,{timeout:120000});
    const text=await page.locator('.formula-editor textarea').evaluateAll(nodes=>nodes.map(node=>node.value));
    const pixels=await page.locator('.region img').first().evaluate(async img=>{
      await img.decode();
      const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
      const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;
      let clear=0,white=0,other=0,topInk=0,bottomInk=0;
      for(let i=0;i<d.length;i+=4){const pixel=i/4,y=Math.floor(pixel/c.width),ink=d[i+3]>40;if(d[i+3]===0)clear++;else if(d[i+3]===255&&d[i]===255&&d[i+1]===255&&d[i+2]===255)white++;else other++;if(ink&&y<c.height*.25)topInk++;if(ink&&y>c.height*.78)bottomInk++;}
      return{width:img.naturalWidth,height:img.naturalHeight,clear,white,other,topInk,bottomInk};
    });
    assert(pixels.clear>0&&pixels.white>0&&pixels.other>0);assert(Math.max(pixels.width,pixels.height)>=1500);assert(pixels.topInk>20&&pixels.bottomInk>20,'diagram labels or boundary content were cropped');
    if(process.env.LINEART_OUTPUT){const base64=await page.locator('.region img').first().evaluate(async img=>{const bytes=new Uint8Array(await(await fetch(img.src)).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);});require('node:fs').writeFileSync(process.env.LINEART_OUTPUT,Buffer.from(base64,'base64'));}
    await page.locator('#preview').click();
    await page.waitForFunction(()=>!document.querySelector('#previewPanel').hidden);
    if(process.env.PREVIEW_OUTPUT)await page.locator('#previewCanvas').screenshot({path:process.env.PREVIEW_OUTPUT});
    if(process.env.PPTX_OUTPUT){const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;await download.saveAs(process.env.PPTX_OUTPUT);}
    console.log(JSON.stringify({text,pixels},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
