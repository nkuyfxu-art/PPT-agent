import './scripts/setup.mjs';
import {cp,mkdir,rm} from 'node:fs/promises';

const clientFiles=['README.md','app.js','assets','demo-template.pptx','index.html','pptx.js','styles.css','vision.js','text-regions.js','math.js','template-preview.js','templates','vendor'];
await rm('dist',{recursive:true,force:true});
await mkdir('dist/client',{recursive:true});
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
for(const file of clientFiles)await cp(file,`dist/client/${file}`,{recursive:true});
await cp('ai-api.js','dist/server/ai-api.js');
await cp('ai-provider.js','dist/server/ai-provider.js');
await cp('worker.js','dist/server/index.js');
try{await cp('.openai/hosting.json','dist/.openai/hosting.json');}catch(error){if(error.code!=='ENOENT')throw error;}
console.log('Built Worker API and static client in dist/');
