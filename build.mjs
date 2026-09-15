import {cp,mkdir,rm} from 'node:fs/promises';

const clientFiles=['README.md','app.js','assets','demo-template.pptx','index.html','pptx.js','styles.css','vision.js','templates','vendor'];
await rm('dist',{recursive:true,force:true});
await mkdir('dist/client',{recursive:true});
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
for(const file of clientFiles)await cp(file,`dist/client/${file}`,{recursive:true});
await cp('ai-api.js','dist/server/ai-api.js');
await cp('worker.js','dist/server/index.js');
await cp('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built Worker API and static client in dist/');
