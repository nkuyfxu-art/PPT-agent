import {saveExport,exportFile,listExports} from './export-store.mjs';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleAIRequest} from './ai-api.js';
import {callCodexModel,findCodex} from './codex-provider.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
const exportDirectory=process.env.EXPORT_DIR||path.join(root,'.local/exports');
const revision=createHash('sha256').update((await Promise.all(['app.js','pptx.js','math.js','template-preview.js','text-regions.js','ai-api.js','server.mjs','export-store.mjs'].map(file=>readFile(path.join(root,file))))).map(bytes=>bytes.toString()).join('\n')).digest('hex');
const provider=process.env.AI_PROVIDER||'api';
if(!['api','codex'].includes(provider))throw Error('AI_PROVIDER 只能为 api 或 codex');
if(provider==='codex')process.env.CODEX_BIN=await findCodex(process.env);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname.split('/').some(part=>part.startsWith('.')||part==='node_modules')){res.writeHead(403);return res.end('Forbidden');}
 if(pathname==='/api/ai/status'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({provider,localArchive:true,revision,label:provider==='codex'?'Codex GPT · 云端识别':(process.env.AI_API_KEY||process.env.SILICONFLOW_API_KEY)?'供应商 API · 云端识别':'本地 OCR · 未启用大模型'}));}
 if(pathname==='/api/exports'||pathname.startsWith('/api/exports/')){
  if(req.headers.origin&&!['http://127.0.0.1:'+(process.env.PORT||4173),'http://localhost:'+(process.env.PORT||4173)].includes(req.headers.origin)){res.writeHead(403);return res.end('Forbidden origin');}
  if(pathname==='/api/exports'&&req.method==='POST'){
   try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>110*1024*1024){res.writeHead(413);return res.end('Too large');}chunks.push(chunk);}
    const record=await saveExport(exportDirectory,JSON.parse(Buffer.concat(chunks).toString()),revision);res.writeHead(201,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(record));
   }catch(error){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:error.message}));}
  }
  if(pathname==='/api/exports'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(await listExports(exportDirectory)));}
  const match=pathname.match(/^\/api\/exports\/([^/]+)\/([^/]+)$/);
  if(match&&req.method==='GET'){const bytes=await exportFile(exportDirectory,match[1],match[2]);res.writeHead(200,{'Content-Type':types[path.extname(match[2])]||'application/octet-stream','Cache-Control':'no-store',...(match[2]==='result.pptx'?{'Content-Disposition':'attachment; filename="Slidecraft.pptx"'}:{})});return res.end(bytes);}
  res.writeHead(405);return res.end('Method not allowed');
 }
 if(pathname.startsWith('/api/ai/')){
  if(req.headers.origin&&!['http://127.0.0.1:'+ (process.env.PORT||4173),'http://localhost:'+(process.env.PORT||4173)].includes(req.headers.origin)){res.writeHead(403);return res.end('Forbidden origin');}
  const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((n,b)=>n+b.length,0)>12_000_000){res.writeHead(413);return res.end('Too large');}}
  const request=new Request(`http://localhost${pathname}`,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined});
  const response=await handleAIRequest(request,process.env,provider==='codex'?callCodexModel:undefined);res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(Buffer.from(await response.arrayBuffer()));
 }
 if(pathname==='/api/templates'){
  const names=(await readdir(path.join(root,'templates'),{withFileTypes:true})).filter(e=>e.isFile()&&e.name.toLowerCase().endsWith('.pptx')).map(e=>e.name).sort((a,b)=>a.localeCompare(b,'zh-CN'));
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(JSON.stringify({templates:names,default:names.find(n=>n.toLowerCase().startsWith('default'))||names[0]||null}));
 }
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)||req.method!=='GET'){res.writeHead(403);return res.end('Forbidden');}
 const data=await readFile(file);
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'credentialless'});res.end(data);
}catch{res.writeHead(404);res.end('Not found');}}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Slidecraft 已启动：http://127.0.0.1:'+(process.env.PORT||4173)));
