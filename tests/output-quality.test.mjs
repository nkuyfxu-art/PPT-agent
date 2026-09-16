import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMath,mathText,mathOMML} from '../math.js';
import {autoFormulaizeText,displayMathText,layoutRegions} from '../pptx.js';
import {mergeTextRegions} from '../text-regions.js';
import {handleAIRequest} from '../ai-api.js';
test('real ABAC spacing is consumed and formula wrapping is idempotent',()=>{
 const input='$AB=AC=2,\\ AD=4$，求：$BD\\cdot CD$';
 assert.equal(displayMathText(input),'AB=AC=2, AD=4，求：BD·CD');
 let current='已知 $AB=AC$，求证 $BD=DE$。';
 const once=autoFormulaizeText(current);for(let i=0;i<5;i++)current=autoFormulaizeText(current);
 assert.equal(current,once);
});
test('nested maths retain structure in Office Math and readable meaning in the preview',()=>{
 const node=parseMath('\\frac{1}{\\sqrt{2}}');
 const xml=mathOMML(node,32,text=>'<m:t>'+text+'</m:t>');
 assert.match(xml,/<m:f>/);assert.match(xml,/<m:rad>/);assert(!xml.includes('\\'));
 assert.equal(mathText(parseMath('x^{23}')),'x²³');
 assert.equal(mathText(parseMath('AB\\perp CD,\\ AB\\parallel EF')),'AB⊥CD, AB∥EF');
 assert.throws(()=>parseMath('\\unsupported{x}'),/暂不支持/);
 assert.throws(()=>parseMath('\\frac{1}{2'),/未闭合/);
});
test('diagram labels stay out of body text while equations and captions remain',()=>{
 const diagram={x:30,y:70,w:370,h:240};
 const question={x:0,y:0,w:436,h:30,sourceText:'△ABC 为等边三角形，AD=CE，求证：BD=DE。'};
 const ad={x:145,y:55,w:100,h:80,sourceText:'$A$\n$D$',inkBox:{x:150,y:85,w:40,h:40}};
 const ce={x:260,y:275,w:100,h:38,sourceText:'$C$\n$E$'};
 const equation={x:150,y:90,w:100,h:25,sourceText:'$AD=CE$'};
 const caption={x:0,y:320,w:150,h:20,sourceText:'图外说明'};
 assert.deepEqual(mergeTextRegions([question],[ad,ce,equation,caption],[diagram]).map(r=>r.sourceText),[question.sourceText,equation.sourceText,caption.sourceText]);
 assert.equal(mergeTextRegions([],[ad],[]).length,1);
});
test('model annotation postprocessing preserves decimals, signs, roots and degrees',async()=>{
 const labels=['3.5','−2','30°','√2','x+1'];
 const response=await handleAIRequest(new Request('http://localhost/api/ai/image',{method:'POST',body:JSON.stringify({image:'data:image/png;base64,AA=='})}),{},async()=>({kind:'diagram',semantic:{annotations:labels.map(text=>({text,x:500,y:500,size:36}))}}));
 assert.equal(response.status,200);assert.deepEqual((await response.json()).semantic.annotations.map(a=>a.text),labels);
});
test('zero positions are honored and extreme images keep their aspect ratio',()=>{
 const template={width:12192000,height:6858000},text={type:'text',text:'题干'},image={type:'image',png:true,w:100,h:500,pngWidth:100,pngHeight:500};
 const layout=layoutRegions(template,[text,image],{textY:0,imageY:0,imageScale:140});
 assert.equal(layout[0].pptY,0);assert.equal(layout[1].pptY,0);
 assert(Math.abs(layout[1].pptW/layout[1].pptH-.2)<1e-10);
});
