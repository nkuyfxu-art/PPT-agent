import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {saveExport,listExports,exportFile} from '../export-store.mjs';
test('iterations keep independent source, preview, PPT and recognition snapshots',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'slidecraft-export-test-'));
 try{
  const body={sourceName:'同一张图.png',source:'data:image/png;base64,AQID',preview:'data:image/png;base64,BAUG',pptx:'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,UEsDBA==',snapshot:{regions:[{text:'原文'}]}};
  const first=await saveExport(directory,body,'rev1'),second=await saveExport(directory,{...body,snapshot:{regions:[{text:'改后'}]}},'rev2');
  assert.notEqual(first.id,second.id);assert.equal((await listExports(directory)).length,2);
  assert.match(await readFile(path.join(first.directory,'snapshot.json'),'utf8'),/原文/);
  assert.match(await readFile(path.join(second.directory,'snapshot.json'),'utf8'),/改后/);
  assert.deepEqual(await exportFile(directory,first.id,'result.pptx'),Buffer.from('504b0304','hex'));
  assert.equal(first.sha256['preview.png'].length,64);
  await assert.rejects(exportFile(directory,'../../','result.pptx'),/路径/);
  await assert.rejects(saveExport(directory,{...body,source:'data:text/html;base64,AQID'}),/格式/);
  assert.equal((await listExports(directory)).length,2);
 }finally{await rm(directory,{recursive:true,force:true});}
});
