import express from 'express';
import {translateText} from './translation.mjs';
import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateSources,callAI,localAIAllowed,aiSettings} from './ai.mjs';
import {createBetaService,betaErrorResponse,production} from './beta.mjs';
import {BetaError} from './beta-config.mjs';
import {createByokService,discardAuthorization} from './byok.mjs';

// Shared Express application: importing it never opens a port or starts Vite.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function createApp({beta=createBetaService(),byok=createByokService()}={}){
const app=express();
app.disable('x-powered-by');app.use(express.json({limit:'200kb'}));
async function status(req,res){
 res.set('Cache-Control','private, no-store');
 if(!production())return res.json({configured:localAIAllowed(req)&&!!process.env.AI_API_KEY,localOnly:true,...aiSettings()});
 const {beta:owner,...settings}=await beta.status(req);res.json({...settings,owner,byok:await byok.status(req,res)});
}
app.get('/api/status',status);
app.get('/api/beta/session',status);
for(const action of ['login','logout'])app.post('/api/beta/'+action,async(req,res)=>{
 res.set('Cache-Control','private, no-store');
 if(!production())return res.status(403).json({error:'Beta sessions are only available on the configured production site.',code:'AI_DISABLED'});
 try{res.json(await beta[action](req,res))}catch(e){betaErrorResponse(e,res)}
});
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
 const mode=req.get('x-judu-ai-mode');
 // A supplied user credential must never accidentally select owner/local billing.
 if(mode!=='byok'&&req.get('authorization')){discardAuthorization(req);return betaErrorResponse(new BetaError('AI_MODE_REQUIRED'),res)}
 if(production()){
  res.set('Cache-Control','private, no-store');
  try{
   if(mode!=='owner'&&mode!=='byok')throw new BetaError('AI_MODE_REQUIRED');
   const result=await (mode==='owner'?beta:byok).paid(req,res,req.params.task);if(!res.destroyed)res.json(result);
  }catch(e){if(!res.destroyed)betaErrorResponse(e,res)}return;
 }
 if(mode==='byok'){discardAuthorization(req);return betaErrorResponse(new BetaError('BYOK_DISABLED'),res)}
 if(mode&&mode!=='local'&&mode!=='owner')return betaErrorResponse(new BetaError('AI_MODE_REQUIRED'),res);
 if(!localAIAllowed(req))return res.status(403).json({error:'Paid AI is restricted to direct localhost development or configured, authenticated Friends Beta access.'});
 if(!process.env.AI_API_KEY)return res.status(503).json({error:'AI is optional and not configured. Set AI_API_KEY and AI_MODEL on the server to enable advanced tools. PDF reading, translation, notes and highlights do not need an AI key.'});
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
app.use((err,req,res,_next)=>{discardAuthorization(req);res.set('Cache-Control','private, no-store');res.status(400).json({error:err.type==='entity.too.large'?'Request too large. Please choose a smaller scope.':'Invalid request format.',code:'INVALID_REQUEST'})});

return app;
}
export default createApp();
