import {spawn} from 'node:child_process';
import {mkdir,open,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
const url=`http://127.0.0.1:${process.env.PORT||4173}`;
async function running(){
 try{const response=await fetch(`${url}/api/ai/status`,{signal:AbortSignal.timeout(800)});const body=await response.json();return response.ok&&['api','codex'].includes(body.provider);}catch{return false;}
}
if(await running()){
 console.log(`Slidecraft 已在运行：${url}`);
}else{
 const runtime=path.join(root,'.local');await mkdir(runtime,{recursive:true});
 const log=await open(path.join(runtime,'server.log'),'a',0o600);
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:process.env,detached:true,stdio:['ignore',log.fd,log.fd]});
 let launchError;child.once('error',error=>{launchError=error;});child.unref();await log.close();
 await writeFile(path.join(runtime,'server.pid'),String(child.pid||''));
 let ready=false;
 for(let attempt=0;attempt<20;attempt++){
  if(launchError)throw launchError;
  if(await running()){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!ready)throw Error(`服务未能启动，请检查 ${path.join(runtime,'server.log')}`);
 console.log(`Slidecraft 已在后台启动：${url}\n日志：${path.join(runtime,'server.log')}`);
}
