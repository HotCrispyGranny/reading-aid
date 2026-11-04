import {byokConfig,BetaError,requireOrigin,verifyByokSession,issueByokSession,sessionCookie,BYOK_COOKIE,same,digest} from './beta-config.mjs';
import {RedisByokStore} from './byok-store.mjs';
import {validateBetaRequest} from './beta.mjs';
import {prepareAIRequest,callAI} from './ai.mjs';

/** Transient header only. Never pass the key, or a fingerprint of it, to Redis,
 * cookies, request bodies/prompts, logs, process caches or response objects. */
export function discardAuthorization(req){
 delete req.headers.authorization;
 for(let i=0;i<(req.rawHeaders?.length||0);i+=2)if(req.rawHeaders[i].toLowerCase()==='authorization')req.rawHeaders[i+1]='[redacted]';
}
function takeKey(req){
 const header=req.get('authorization')||'';discardAuthorization(req);
 if(!header)throw new BetaError('BYOK_KEY_REQUIRED');
 if(/[\r\n]/.test(header)||! /^Bearer sk-[A-Za-z0-9_-]{16,500}$/.test(header))throw new BetaError('BYOK_KEY_INVALID');
 return header.slice(7);
}
export function createByokService({config=()=>byokConfig(),store=c=>new RedisByokStore(c),ai=callAI,now=()=>Date.now()}={}){
 return {
  async status(req,res){
   try{
    const c=config();await store(c).readyByok();let s;
    try{s=verifyByokSession(req,c,now())}catch{
     const token=issueByokSession(c,now());res.append('Set-Cookie',sessionCookie(token,undefined,BYOK_COOKIE));
     s=verifyByokSession({get:()=>`${BYOK_COOKIE}=${token}`},c,now());
    }
    return {enabled:true,state:'available',csrfToken:s.csrf};
   }catch(e){return {enabled:false,state:e.code==='BYOK_DISABLED'?'disabled':'unavailable'}}
  },
  async paid(req,res,task){
   let apiKey='';let lease,limiter,controller,timer,closed;
   try{
    // Strip the header even when configuration/session/input validation fails.
    apiKey=takeKey(req);
    const c=config();requireOrigin(req,c);const s=verifyByokSession(req,c,now());
    if(!same(req.get('x-csrf-token'),s.csrf))throw new BetaError('CSRF_REJECTED');
    const args=validateBetaRequest(task,req.body),requestId=req.get('x-ai-request-id');
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId||''))throw new BetaError('INVALID_REQUEST');
    const prepared=prepareAIRequest(args);
    if(Buffer.byteLength(JSON.stringify(prepared.input),'utf8')+8192>100000)throw new BetaError('INVALID_REQUEST');
    limiter=store(c);
    lease=await limiter.reserveByok(s.id,digest(c.secret+'\0'+(req.socket?.remoteAddress||'unknown')),requestId.toLowerCase(),now());
    controller=new AbortController();timer=setTimeout(()=>controller.abort(),60000);closed=()=>controller.abort();res.on('close',closed);
    if(res.destroyed)throw new BetaError('AI_UNAVAILABLE');
    const result=await ai({...args,signal:controller.signal},{apiKey,prepared,cache:false,trackProcess:false});
    const {sessionEstimatedUSD,...usage}=result.usage;return {...result,usage};
   }catch(e){
    if(e instanceof BetaError)throw e;
    throw new BetaError(e.code==='OPENAI_AUTH_FAILED'?'BYOK_KEY_INVALID':e.code==='OPENAI_RATE_LIMITED'?'BYOK_PROVIDER_LIMITED':'AI_UNAVAILABLE');
   }finally{
    apiKey='';discardAuthorization(req);
    if(timer)clearTimeout(timer);if(closed)res.off('close',closed);
    if(lease){try{await limiter.finishByok(lease)}catch{/* Leases expire; this cannot release or charge owner money. */}}
   }
  }
 };
}
