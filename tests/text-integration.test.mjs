import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeTextRegions} from '../text-regions.js';
import {autoFormulaizeText,displayMathText} from '../pptx.js';

test('AI paragraph does not duplicate its padded local OCR lines, but preserves another paragraph',()=>{
 const ai=[{x:67,y:48,w:660,h:110,sourceText:'两行题干'}];
 const local=[{x:70,y:44,w:650,h:80,text:'第一行'},{x:70,y:114,w:550,h:80,text:'第二行'},{x:70,y:240,w:550,h:80,text:'另一个题干'}];
 assert.deepEqual(mergeTextRegions(ai,local).map(r=>r.sourceText),['两行题干','另一个题干']);
 assert.equal(mergeTextRegions([],local).length,3);
});

test('GPT angle and degree LaTeX is readable and normalized before Office Math export',()=>{
 for(const latex of [String.raw`\angle A=40^\circ`,String.raw`\angle A=40^{\circ}`,String.raw`∠A=40^{\circ}`]){
  const text=autoFormulaizeText(`1. 已知 $${latex}$，求角度。`);
  assert.equal(text.replace(/ +/g,' '),'1. 已知 $∠A=40°$，求角度。');
  assert.equal(displayMathText(text).replace(/ +/g,' '),'1. 已知 ∠A=40°，求角度。');
 }
});
