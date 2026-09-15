const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:4173');
    await page.waitForFunction(()=>!document.querySelector('#templateCatalog').disabled);
    for(const [id,value] of [['textY','22'],['textSize','36'],['imageScale','60'],['imageY','75']]){
      await page.locator(`#${id}`).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
    }
    assert.equal(await page.locator('#textY').inputValue(),'22');
    assert.equal(await page.locator('#textSize').inputValue(),'36');
    assert.equal(await page.locator('#imageScale').inputValue(),'60');
    assert.equal(await page.locator('#imageY').inputValue(),'75');
    const layout=await page.evaluate(async()=>{
      const {layoutRegions}=await import('/pptx.js');
      const template={width:1000,height:1000};
      const regions=[{type:'text',text:'题目',x:0,y:0,w:1,h:1},{type:'image',png:{},pngWidth:400,pngHeight:200,x:0,y:0,w:400,h:200}];
      const a=layoutRegions(template,regions,{textSize:36,textY:22,imageScale:60,imageY:20});
      const b=layoutRegions(template,regions,{textSize:36,textY:10,imageScale:60,imageY:42});
      const large=layoutRegions(template,regions,{textSize:36,textY:22,imageScale:120,imageY:20});
      const low=layoutRegions(template,regions,{textSize:36,textY:22,imageScale:60,imageY:80});
      return {a:a.map(({pptX,pptY,pptW,pptH,fontSize,type})=>({pptX,pptY,pptW,pptH,fontSize,type})),b:b.map(({pptH,type})=>({pptH,type})),large:large.find(x=>x.type==='image'),low:low.find(x=>x.type==='image')};
    });
    const multi=await page.evaluate(async()=>{const {layoutRegions}=await import('/pptx.js'),template={width:1000,height:1000},png={};return layoutRegions(template,[{type:'image',png,pngWidth:400,pngHeight:200},{type:'image',png,pngWidth:300,pngHeight:300}],{imageScale:140,imageY:50}).map(x=>({x:x.pptX,y:x.pptY,w:x.pptW,h:x.pptH}))});assert.equal(multi.length,2);assert(multi[0].x+multi[0].w<=multi[1].x||multi[1].x+multi[1].w<=multi[0].x||multi[0].y+multi[0].h<=multi[1].y||multi[1].y+multi[1].h<=multi[0].y);const preserved=await page.evaluate(async()=>{const {layoutRegions}=await import('/pptx.js'),png={};return layoutRegions({width:1000,height:1000},[{type:'image',png,x:20,y:100,w:200,h:150},{type:'image',png,x:360,y:240,w:300,h:200}],{imageScale:80,imageY:55}).filter(x=>x.type==='image').map(x=>({x:x.pptX,y:x.pptY,w:x.pptW,h:x.pptH}))});assert(preserved[0].x<preserved[1].x&&preserved[0].y<preserved[1].y);const text=layout.a.find(x=>x.type==='text'),image=layout.a.find(x=>x.type==='image');
    assert.equal(text.pptY,220);assert.equal(text.pptH,220);assert.equal(text.fontSize,36);
    assert.equal(layout.b.find(x=>x.type==='text').pptH,220);
    assert.equal(image.pptW,390);assert.equal(image.pptH,195);assert.equal(image.pptY,161);
    assert.equal(layout.large.pptW,780);assert.equal(layout.large.pptH,390);
    assert.equal(layout.low.pptW,390);assert.equal(layout.low.pptY,644);
    const exported=await page.evaluate(async()=>{const {readTemplate,makePptx}=await import('/pptx.js'),template=await readTemplate(await(await fetch('/demo-template.pptx')).arrayBuffer()),canvas=document.createElement('canvas');canvas.width=20;canvas.height=10;const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),region={type:'image',png,pngWidth:400,pngHeight:200,x:0,y:0,w:400,h:200};const read=async options=>{const blob=await makePptx(template,0,[region],400,200,options),zip=await JSZip.loadAsync(await blob.arrayBuffer()),xml=await zip.file(template.slides[0]).async('string'),doc=new DOMParser().parseFromString(xml,'application/xml'),p='http://schemas.openxmlformats.org/presentationml/2006/main',a='http://schemas.openxmlformats.org/drawingml/2006/main',pic=[...doc.getElementsByTagNameNS(p,'pic')].at(-1),off=pic.getElementsByTagNameNS(a,'off')[0],ext=pic.getElementsByTagNameNS(a,'ext')[0];return{x:+off.getAttribute('x'),y:+off.getAttribute('y'),w:+ext.getAttribute('cx'),h:+ext.getAttribute('cy')}};return{smallHigh:await read({imageScale:40,imageY:10}),largeLow:await read({imageScale:100,imageY:80})};});
    assert(exported.largeLow.w>exported.smallHigh.w*2);assert(exported.largeLow.y>exported.smallHigh.y);
    console.log('PASS: text and image size/position controls produce independent geometry changes.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
