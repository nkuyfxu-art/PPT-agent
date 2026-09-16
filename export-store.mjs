import {mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const safeId=/^[0-9TZA-Za-z_-]{20,80}$/;
const decode=(value,mime,limit)=>{
  if(typeof value!=='string')throw Error('缺少归档文件');
  const match=/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if(!match||!mime.test(match[1]))throw Error('归档文件格式不正确');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>limit)throw Error('归档文件大小不正确');
  return {bytes,mime:match[1]};
};
export async function saveExport(directory,body,revision='unknown'){
  const source=decode(body.source,/^image\/(png|jpeg|webp|bmp)$/,30*1024*1024);
  const preview=decode(body.preview,/^image\/png$/,8*1024*1024);
  const pptx=decode(body.pptx,/^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/,40*1024*1024);
  if(pptx.bytes[0]!==0x50||pptx.bytes[1]!==0x4b)throw Error('PPTX 文件格式不正确');
  if(!body.snapshot||typeof body.snapshot!=='object'||Array.isArray(body.snapshot))throw Error('缺少识别快照');
  const snapshot=JSON.stringify(body.snapshot,null,2);if(snapshot.length>4_000_000)throw Error('识别数据过大');
  const id=new Date().toISOString().replace(/[:.]/g,'-')+'_'+randomUUID().slice(0,8);
  const folder=path.join(directory,id),extension=source.mime.split('/')[1];
  await mkdir(folder,{recursive:true});
  try{
    const files={['source.'+extension]:source.bytes,'preview.png':preview.bytes,'result.pptx':pptx.bytes,'snapshot.json':Buffer.from(snapshot)};
    const metadata={id,createdAt:new Date().toISOString(),sourceName:String(body.sourceName||'截图').slice(0,180),revision,sourceFile:'source.'+extension,sha256:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')]))};
    await Promise.all(Object.entries(files).map(([name,bytes])=>writeFile(path.join(folder,name),bytes,{flag:'wx'})));
    await writeFile(path.join(folder,'metadata.json'),JSON.stringify(metadata,null,2),{flag:'wx'});
    return {...metadata,directory:folder,pptxUrl:'/api/exports/'+id+'/result.pptx'};
  }catch(error){await rm(folder,{recursive:true,force:true});throw error;}
}
export async function exportFile(directory,id,name){
  if(!safeId.test(id)||!['metadata.json','snapshot.json','preview.png','result.pptx','source.png','source.jpeg','source.webp','source.bmp'].includes(name))throw Error('归档路径无效');
  return readFile(path.join(directory,id,name));
}
export async function listExports(directory){
  const names=await readdir(directory).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  const entries=await Promise.all(names.filter(name=>safeId.test(name)).map(async name=>{try{return JSON.parse(await readFile(path.join(directory,name,'metadata.json'),'utf8'));}catch{return null;}}));
  return entries.filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
