import {handleAIRequest} from './ai-api.js';

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/ai/'))return handleAIRequest(request,env);
  if(env.ASSETS?.fetch)return env.ASSETS.fetch(request);
  return new Response('Static assets binding unavailable',{status:503});
 }
};
