import express from 'express';
import {translateText} from './translation.mjs';
import {EnvHttpProxyAgent,setGlobalDispatcher} from 'undici';
import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateSources,callAI} from './ai.mjs';
// Read .env only on the server; no VITE_ variables contain secrets.
try{process.loadEnvFile()}catch(e){if(e.code!=='ENOENT')throw e}
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
const app=express(),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
app.disable('x-powered-by');app.use(express.json({limit:'200kb'}));
app.get('/api/status',(_req,res)=>res.json({configured:!!process.env.AI_API_KEY,model:process.env.AI_MODEL||'gpt-4.1-mini'}));
async function libraryFiles(){try{return (await readdir(path.join(root,'.local/papers'))).filter(n=>n.toLowerCase().endsWith('.pdf')).map(name=>({id:createHash('sha256').update(name).digest('hex').slice(0,20),name}))}catch{return []}}
app.get('/api/library',async(_req,res)=>res.json(await libraryFiles()));
app.get('/api/library/:id',async(req,res)=>{const entry=(await libraryFiles()).find(f=>f.id===req.params.id);if(!entry)return res.status(404).json({error:'Paper not found.'});res.set('Cache-Control','private, no-store');res.sendFile(path.join(root,'.local/papers',entry.name))});
const recent=new Map();let active=0;
const translationCache=new Map();let translating=0;
app.post('/api/translate',async(req,res)=>{
 const origin=req.get('origin');if(origin&&new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Cross-site requests are not allowed.'});
 const text=req.body.text;if(typeof text!=='string'||!text.trim()||text.length>4000)return res.status(400).json({error:'Select between 1 and 4,000 characters of English text.'});
 const cached=translationCache.get(text);if(cached)return res.json(cached);
 const now=Date.now(),key='translate:'+req.ip,times=(recent.get(key)||[]).filter(t=>now-t<60000);recent.set(key,times);
 if(translating>=2||times.length>=15)return res.status(429).json({error:'Too many translation requests. Please wait a moment.'});
 times.push(now);translating++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);res.on('close',()=>controller.abort());
 try{const result=await translateText(text.trim(),controller.signal);if(translationCache.size>=500)translationCache.delete(translationCache.keys().next().value);translationCache.set(text,result);if(!res.destroyed)res.json(result)}catch(e){if(!res.destroyed)res.status(502).json({error:e.name==='AbortError'?'Translation timed out. Please retry.':e.message})}finally{translating--;clearTimeout(timer)}
});
app.post('/api/:task',async(req,res)=>{
 if(!['analyze','chat','word'].includes(req.params.task))return res.status(404).json({error:'Unknown operation.'});
 if(!process.env.AI_API_KEY)return res.status(503).json({error:'AI is optional and not configured. Set AI_API_KEY, AI_BASE_URL and AI_MODEL on the server to enable advanced tools. PDF reading, translation, notes and highlights do not need an AI key.'});
 // Same-origin endpoint; don't expose this local tool on the public Internet without authentication.
 const origin=req.get('origin');if(origin&&new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Cross-site requests are not allowed.'});
 const key=req.ip,now=Date.now();const times=(recent.get(key)||[]).filter(t=>now-t<60000);recent.set(key,times);
 if(times.length>=20||active>=4)return res.status(429).json({error:'Too many requests. Please try again shortly.'});
 times.push(now);
 let sources;try{sources=validateSources(req.body.sources)}catch(e){return res.status(400).json({error:e.message})}
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),60000);res.on('close',()=>controller.abort());active++;
 try{const result=await callAI({...req.body,task:req.params.task,sources,signal:controller.signal});if(!res.destroyed)res.json(result)}catch(e){if(!res.destroyed)res.status(502).json({error:e.name==='AbortError'?'AI request timed out or was canceled. Please retry.':e.message})}finally{active--;clearTimeout(timer)}
});
app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
if(process.env.NODE_ENV==='production'){app.use(express.static(path.join(root,'dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(path.join(root,'dist/index.html')))}else{
 const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
app.use((err,_req,res,_next)=>res.status(400).json({error:err.type==='entity.too.large'?'Request too large. Please choose a smaller scope.':'Invalid request format.'}));
const args=process.argv.slice(2);const flag=n=>args[args.indexOf(n)+1];const port=Number(process.env.PORT||(args.includes('--port')?flag('--port'):4173));const host=process.env.HOST||(args.includes('--host')?flag('--host'):'0.0.0.0');
app.listen(port,host,()=>console.log(`句读 reader listening on ${host}:${port}; AI ${process.env.AI_API_KEY?'configured':'not configured'}`));
