import http from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleAIRequest} from './ai-api.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.json':'application/json'};
http.createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname.startsWith('/api/ai/')){
  const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((n,b)=>n+b.length,0)>12_000_000){res.writeHead(413);return res.end('Too large');}}
  const request=new Request(`http://localhost${pathname}`,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined});
  const response=await handleAIRequest(request,process.env);res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(Buffer.from(await response.arrayBuffer()));
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
