import {betaConfig,BetaError,production,requireOrigin,verifySession,inviteIdentity,issueSession,sessionCookie,same,digest} from './beta-config.mjs';
import {RedisBetaStore} from './beta-store.mjs';
import {aiSettings,prepareAIRequest,callAI,validateSources,usageCost} from './ai.mjs';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function string(value,max,required=false){if(typeof value!=='string'||value.length>max||required&&!value.trim())throw new BetaError('INVALID_REQUEST')}
export function validateBetaRequest(task,body){
 if(!object(body)||!['analyze','chat','word'].includes(task))throw new BetaError('INVALID_REQUEST');
 const allowed=['sources','question','detail','history','coverage','word','document','complete'];
 if(Object.keys(body).some(k=>!allowed.includes(k)))throw new BetaError('INVALID_REQUEST');
 let sources;try{sources=validateSources(body.sources)}catch{throw new BetaError('INVALID_REQUEST')}
 for(const s of body.sources){if(!object(s)||!s.text.trim()||s.sentenceId!==undefined&&(typeof s.sentenceId!=='string'||s.sentenceId.length>500))throw new BetaError('INVALID_REQUEST')}
 if(body.question!==undefined)string(body.question,3000,task==='chat');else if(task==='chat')throw new BetaError('INVALID_REQUEST');
 if(body.word!==undefined)string(body.word,200,task==='word');else if(task==='word')throw new BetaError('INVALID_REQUEST');
 if(body.coverage!==undefined)string(body.coverage,300);
 if(body.detail!==undefined&&!['short','long'].includes(body.detail))throw new BetaError('INVALID_REQUEST');
 if(body.complete!==undefined&&typeof body.complete!=='boolean')throw new BetaError('INVALID_REQUEST');
 if(body.history!==undefined){if(!Array.isArray(body.history)||body.history.length>4)throw new BetaError('INVALID_REQUEST');for(const m of body.history){if(!object(m)||!['user','assistant'].includes(m.role))throw new BetaError('INVALID_REQUEST');string(m.content,1500)}}
 if(body.document!==undefined){if(!object(body.document))throw new BetaError('INVALID_REQUEST');for(const [k,n]of [['title',500],['fileName',300],['section',300]])if(body.document[k]!==undefined)string(body.document[k],n);if(body.document.page!==undefined&&(!Number.isInteger(body.document.page)||body.document.page<1))throw new BetaError('INVALID_REQUEST')}
 return {...body,task,sources};
}
/** For this fixed text-only model/request format: one token per UTF-8 byte is
 * deliberately pessimistic. 8,192 extra tokens cover message framing. No tools,
 * images, client model settings or unbounded strings enter this request. */
export function maximumCost(input,config){
 const inputBound=Buffer.byteLength(JSON.stringify(input),'utf8')+8192;
 if(inputBound>100000)throw new BetaError('INVALID_REQUEST');
 return Math.ceil(inputBound*config.pricing.input+config.maxOutputTokens*config.pricing.output);
}
function knownUsage(u){return u&&Number.isSafeInteger(u.input_tokens)&&u.input_tokens>0&&Number.isSafeInteger(u.output_tokens)&&u.output_tokens>=0&&Number.isSafeInteger(u.input_tokens_details?.cached_tokens??0)&&(u.input_tokens_details?.cached_tokens??0)>=0&&(u.input_tokens_details?.cached_tokens??0)<=u.input_tokens}

export function createBetaService({config=()=>betaConfig(),store=c=>new RedisBetaStore(c),ai=callAI,now=()=>Date.now()}={}){
 return {
  async status(req){
   const settings=aiSettings();const base={configured:false,localOnly:false,model:'gpt-5-mini',maxOutputTokens:settings.maxOutputTokens,pricing:settings.pricing};
   let c;try{c=config();await store(c).ready()}catch(e){return {...base,beta:{enabled:false,authenticated:false,state:e.code==='AI_DISABLED'?'disabled':'unavailable'}}}
   try{const s=verifySession(req,c,now());await store(c).authorize(s.id,s.invite);return {...base,configured:true,beta:{enabled:true,authenticated:true,state:'authenticated',csrfToken:s.csrf}}}
   catch(e){return {...base,beta:{enabled:e.code!=='AI_UNAVAILABLE',authenticated:false,state:e.code==='AI_UNAVAILABLE'?'unavailable':e.code==='SESSION_EXPIRED'?'session_expired':e.code==='SESSION_INVALID'?'session_invalid':'authentication_required'}}}
  },
  async login(req,res){
   const c=config();requireOrigin(req,c);
   // Do not trust arbitrary forwarded-IP headers. A shared proxy may make this
   // bucket stricter; the separate global attempt limit always applies.
   await store(c).attempt(digest(c.secret+'\0'+(req.socket?.remoteAddress||'unknown')),now());
   if(!object(req.body)||Object.keys(req.body).length!==1)throw new BetaError('INVALID_INVITE');
   const id=inviteIdentity(req.body.code,c);await store(c).authorize(id,c.invites[id]);res.set('Set-Cookie',sessionCookie(issueSession(id,c,now())));return {authenticated:true};
  },
  async logout(req,res){const c=config();requireOrigin(req,c);const s=verifySession(req,c,now());if(!same(req.get('x-csrf-token'),s.csrf))throw new BetaError('CSRF_REJECTED');res.set('Set-Cookie',sessionCookie('',0));return {authenticated:false}},
  async paid(req,res,task){
   const c=config();requireOrigin(req,c);const s=verifySession(req,c,now());if(!same(req.get('x-csrf-token'),s.csrf))throw new BetaError('CSRF_REJECTED');
   const args=validateBetaRequest(task,req.body),requestId=req.get('x-ai-request-id');
   if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId||''))throw new BetaError('INVALID_REQUEST');
   const prepared=prepareAIRequest(args),maximum=maximumCost(prepared.input,c),ledger=store(c);
   const reservation=await ledger.reserve(s.id,requestId.toLowerCase(),maximum,now(),s.invite);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);const closed=()=>controller.abort();res.on('close',closed);
   let settled=false;
   try{
    if(res.destroyed)throw new BetaError('AI_UNAVAILABLE');
    const result=await ai({...args,signal:controller.signal},{prepared,cache:false,trackProcess:false,onUsage:async usage=>{
     if(!knownUsage(usage))throw new BetaError('AI_UNAVAILABLE');
     const actual=Math.ceil(usageCost(usage,c.pricing)*1e6);
     await ledger.finish(reservation,actual,usage);settled=true;
    }});
    if(!settled)throw new BetaError('AI_UNAVAILABLE');
    const {sessionEstimatedUSD,...usage}=result.usage;
    return {...result,usage};
   }catch{throw new BetaError('AI_UNAVAILABLE')}
   finally{clearTimeout(timer);res.off('close',closed);if(!settled){try{await ledger.finish(reservation,null)}catch{/* Keep the entire reservation held; never refund an unknown charge. */}}}
  }
 };
}
export function betaErrorResponse(error,res){const e=error instanceof BetaError?error:new BetaError('AI_UNAVAILABLE');res.set('Cache-Control','private, no-store');if(e.status===429)res.set('Retry-After','60');return res.status(e.status).json({error:e.message,code:e.code})}
export {production};
