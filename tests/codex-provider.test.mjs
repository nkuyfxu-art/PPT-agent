import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {callCodexModel} from '../codex-provider.mjs';

async function fixture(code) {
 const dir=await mkdtemp(path.join(os.tmpdir(),'slidecraft-adapter-test-'));
 const bin=path.join(dir,'fake-codex');
 await writeFile(bin,`#!${process.execPath}\n${code}`,{mode:0o700});
 return {dir,bin};
}

test('CLI adapter passes image bytes and JSON through stdin/files, without a shell; removes temporary files',async()=>{
 const {dir,bin}=await fixture(`
const fs=require('node:fs');const args=process.argv.slice(2);let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
 const image=args[args.indexOf('--image')+1];
 fs.writeFileSync(process.env.TEST_TRACE,JSON.stringify({args,input,cwd:process.cwd(),image:fs.readFileSync(image).toString()}));
 fs.writeFileSync(args[args.indexOf('-o')+1],JSON.stringify({blocks:[{index:1,text:'已知 AB=3'}]}));
});`);
 try{
  const trace=path.join(dir,'trace.json');
  const result=await callCodexModel({CODEX_BIN:bin,CODEX_MODEL:'test-model',TEST_TRACE:trace},[{role:'system',content:'只识别图片'},{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,aW1hZ2U='}},{type:'text',text:'$(touch NEVER) `literal`'}]}],2400,'vision','ocr');
  assert.equal(result.blocks[0].text,'已知 AB=3');
  const log=JSON.parse(await readFile(trace,'utf8'));assert.equal(log.image,'image');assert.match(log.input,/\$\(touch NEVER\)/);
  assert(!log.args.some(s=>s.includes('touch NEVER')));assert(log.args.includes('--ephemeral'));assert(log.args.includes('read-only'));
  assert.equal(log.args[log.args.indexOf('--model')+1],'test-model');
  await assert.rejects(stat(log.cwd),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('CLI timeout terminates the process and clears its temporary directory',async()=>{
 const {dir,bin}=await fixture(`require('node:fs').writeFileSync(process.env.TEST_TRACE,process.cwd());setInterval(()=>{},1000);`);
 try{
  const trace=path.join(dir,'trace');
  await assert.rejects(callCodexModel({CODEX_BIN:bin,CODEX_TIMEOUT_MS:'1000',TEST_TRACE:trace},[{role:'user',content:'test'}],500,'text','personalize'),/超时/);
  await assert.rejects(stat(await readFile(trace,'utf8')),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('CLI login errors are readable and raw output is not exposed or automatically retried',async()=>{
 const {dir,bin}=await fixture(`process.stderr.write('401 unauthorized private-marker');process.exit(1);`);
 try{
  await assert.rejects(callCodexModel({CODEX_BIN:bin},[{role:'user',content:'test'}],500,'text','personalize'),error=>/登录/.test(error.message)&&!error.message.includes('private-marker')&&error.retryable===false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
