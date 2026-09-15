const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {execFileSync}=require('node:child_process');

(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:1000}});let ocrCalls=0,imageCalls=0;
    await page.route('**/api/ai/ocr',async route=>{ocrCalls++;await route.fulfill({contentType:'application/json',body:JSON.stringify({blocks:[{index:1,text:'∠AOB=120°'}]})});});
    await page.route('**/api/ai/image',async route=>{imageCalls++;const semantic={confidence:.99,source_label_count:4,vertices:[{id:'A',label:'A',x:240,y:160,label_x:220,label_y:80},{id:'B',label:'B',x:100,y:780,label_x:60,label_y:850},{id:'C',label:'C',x:650,y:780,label_x:650,label_y:870},{id:'D',label:'D',x:900,y:780,label_x:930,label_y:850}],edges:[{from:'A',to:'B',kind:'segment'},{from:'A',to:'C',kind:'segment'},{from:'B',to:'C',kind:'segment'},{from:'C',to:'D',kind:'extension'},{from:'A',to:'D',kind:'segment'}],auxiliaries:[{x1:450,y1:760,x2:470,y2:800,kind:'tick',keep:false}],annotations:[{text:'2',x:500,y:600,size:36}],removed_noise:['green highlight','pink cursor']};await route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'diagram',detail:'detail',content_bbox:{x:0,y:0,w:1000,h:1000},exclude_regions:[],semantic})});});
    const fixture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAhUlEQVR42u3RAQ0AAAgDIN8/9K3hHFQgEurM7AJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAhQoQIESJEiBAh4gWsgAGQnVWLWQAAAABJRU5ErkJggg==','base64');
    await page.goto('http://127.0.0.1:4173');await page.locator('#imageInput').setInputFiles({name:'geometry-fixture.png',mimeType:'image/png',buffer:fixture});await page.waitForFunction(()=>document.querySelector('#imageStatus').textContent.includes('已载入'));
    const box=await page.locator('#canvas').boundingBox();
    await page.locator('#textTool').click();await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+230,box.y+90);await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('#textTool').disabled);
    assert.equal(ocrCalls,1);assert.equal(await page.locator('.formula-editor textarea').inputValue(),'$∠AOB=120°$');
    await page.locator('#imageTool').click();await page.mouse.move(box.x+40,box.y+120);await page.mouse.down();await page.mouse.move(box.x+350,box.y+300);await page.mouse.up();await page.waitForFunction(()=>document.querySelector('.geometry-editor svg'));
    assert.equal(imageCalls,1);assert.equal(await page.locator('.geo-line').count(),5);assert.equal(await page.locator('.geo-label').count(),5);assert.equal(await page.locator('.geo-watermark').count(),1);
    const firstLine=page.locator('.geo-line').first();await firstLine.click({force:true});await page.locator('.geo-color').fill('#ff0000');await page.locator('.geo-value input').fill('6');
    const firstLabel=page.locator('.geo-label').first(),beforeX=+(await firstLabel.getAttribute('x')),labelBox=await firstLabel.boundingBox();await page.mouse.move(labelBox.x+labelBox.width/2,labelBox.y+labelBox.height/2);await page.mouse.down();await page.mouse.move(labelBox.x+labelBox.width/2+14,labelBox.y+labelBox.height/2+9);await page.mouse.up();assert.notEqual(+(await firstLabel.getAttribute('x')),beforeX);await firstLabel.click();await page.locator('.geo-text input').fill('X');await page.locator('.geo-value input').fill('48');assert.equal(await firstLabel.textContent(),'X');
    await page.locator('#preview').click();await page.waitForFunction(()=>!document.querySelector('#export').disabled);const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'slidecraft-editable-')),pptx=path.join(tmp,'out.pptx'),unzipped=path.join(tmp,'unzipped');await download.saveAs(pptx);fs.mkdirSync(unzipped);execFileSync('tar',['-xf',pptx,'-C',unzipped]);const slide=fs.readFileSync(path.join(unzipped,'ppt','slides','slide1.xml'),'utf8');assert((slide.match(/Agent 几何线/g)||[]).length>=5);for(const label of ['X','B','C','D'])assert(slide.includes(`Agent 几何字母 ${label}`));assert(slide.includes('val="FF0000"'));assert(slide.includes('w="76200"'));assert(slide.includes('Agent 几何标注 2'));assert(slide.includes('Agent 独立水印'));assert(!slide.includes('Agent 透明白线图'));fs.rmSync(tmp,{recursive:true,force:true});
    console.log('PASS: geometry units are draggable and style-editable in the browser; edits persist into independent PowerPoint objects.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
