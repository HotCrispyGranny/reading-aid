import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IncomingMessage,ServerResponse} from 'node:http';
import {Duplex} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {createBetaService} from '../server/beta.mjs';
import {createByokService} from '../server/byok.mjs';
import {RedisByokStore} from '../server/byok-store.mjs';
import {betaConfig,byokConfig,BetaError,digest,issueSession,issueByokSession,sessionCookie,verifySession,BYOK_COOKIE,SESSION_SECONDS} from '../server/beta-config.mjs';
import {callAI} from '../server/ai.mjs';
import {createTabKey,aiHeaders} from '../src/lib/ai-access.mjs';

const ownerCode='a'.repeat(43),ownerKey='test-only-owner-key',userKey='sk-test-only-personal-key-not-real-123456789';
const environment={NODE_ENV:'production',VERCEL:'1',AI_BETA_ENABLED:'true',AI_BYOK_ENABLED:'true',AI_BETA_PRICING_CONFIRMED:'true',AI_BETA_ORIGIN:'https://reading-aid.vercel.app',AI_API_KEY:ownerKey,AI_MODEL:'gpt-5-mini',AI_MAX_OUTPUT_TOKENS:'2500',AI_INPUT_USD_PER_MILLION:'.25',AI_CACHED_INPUT_USD_PER_MILLION:'.025',AI_OUTPUT_USD_PER_MILLION:'2',AI_BETA_BUDGET_USD:'5',AI_BETA_SESSION_SECRET:'test-only-signing-secret-'.repeat(3),AI_OWNER_CODE_SHA256:digest(ownerCode),AI_BETA_REDIS_REST_URL:'https://redis.example.test',AI_BETA_REDIS_REST_TOKEN:'test-only-redis-token'};
const body={sources:[{id:'S1',page:1,text:'The sample was stable.'}],question:'Explain it'};
const defaults={host:'reading-aid.vercel.app',origin:environment.AI_BETA_ORIGIN,'sec-fetch-site':'same-origin','content-type':'application/json'};
function request(app,path,{method='POST',headers={},data=body}={}){
 return new Promise((resolve,reject)=>{
  const socket=new Duplex({read(){},write(_d,_e,cb){cb()}});socket.remoteAddress='127.0.0.1';
  const req=new IncomingMessage(socket);req.method=method;req.url=path;const payload=JSON.stringify(data);
  req.headers={...defaults,...headers,...(method==='POST'?{'content-length':String(Buffer.byteLength(payload))}:{})};
  req.rawHeaders=Object.entries(req.headers).flatMap(([k,v])=>[k,String(v)]);
  const res=new ServerResponse(req),timer=setTimeout(()=>reject(Error('handler timed out')),3000);
  res.end=function(value){clearTimeout(timer);this.finished=true;resolve({status:this.statusCode,headers:this.getHeaders(),body:JSON.parse(String(value)),requestHeaders:req.headers,rawHeaders:req.rawHeaders});return this};
  app.handle(req,res);if(method==='POST')req.push(Buffer.from(payload));req.push(null);
 });
}
async function fixture(run,{env={},providerStatus=200}={}){
 const vars={...environment,...env},old={};for(const k of Object.keys(vars)){old[k]=process.env[k];if(vars[k]===undefined)delete process.env[k];else process.env[k]=vars[k]}
 const oldFetch=globalThis.fetch,calls=[],logs=[],oldError=console.error,oldWarn=console.warn;
 console.error=(...args)=>logs.push(args);console.warn=(...args)=>logs.push(args);
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses');calls.push({authorization:options.headers.get('authorization'),organization:options.headers.get('openai-organization'),project:options.headers.get('openai-project'),payload:options.body});
  if(providerStatus!==200)return new Response(JSON.stringify({error:{message:'rejected '+userKey+' '+ownerKey}}),{status:providerStatus,headers:{'Content-Type':'application/json'}});
  const answer=JSON.parse(options.body).input[0].content.includes('"uncertainties"')?{translation:'测试',uncertainties:[],terms:[],structure:{backbone:'测试',explanation:'测试'},reminders:[]}:{answer:'Stable. [S1]',citations:['S1']};
  return new Response(JSON.stringify({id:'test',object:'response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(answer)}]}],usage:{input_tokens:100,output_tokens:20}}),{headers:{'Content-Type':'application/json'}});
 };
 const owner={readyCalls:0,reserves:0,spent:0,failed:false,exhausted:false,
  async ready(){this.readyCalls++;if(this.failed)throw new BetaError('AI_UNAVAILABLE')},async authorize(){if(this.failed)throw new BetaError('AI_UNAVAILABLE')},async attempt(){},
  async reserve(){if(this.failed)throw new BetaError('AI_UNAVAILABLE');if(this.exhausted)throw new BetaError('BUDGET_EXHAUSTED');this.reserves++;return {}},
  async finish(_r,actual){this.spent+=actual||0}
 };
 const byok={calls:[],failed:false,limited:false,
  async readyByok(){if(this.failed)throw new BetaError('AI_UNAVAILABLE')},
  async reserveByok(...args){this.calls.push(args);if(this.failed)throw new BetaError('AI_UNAVAILABLE');if(this.limited)throw new BetaError('RATE_LIMITED');return {}},async finishByok(){}
 };
 try{
  const app=createApp({beta:createBetaService({store:()=>owner}),byok:createByokService({store:()=>byok})});
  const c=betaConfig(environment),ownerCookie=sessionCookie(issueSession('owner',c)).split(';')[0],ownerSession=verifySession({get:()=>ownerCookie},c);
  const status=await request(app,'/api/status',{method:'GET'});
  const cookieList=[status.headers['set-cookie']||[]].flat();
  const clientCookie=cookieList.find(value=>value.startsWith(BYOK_COOKIE+'='))?.split(';')[0]||'';
  const personal={'x-judu-ai-mode':'byok',authorization:'Bearer '+userKey,cookie:clientCookie,'x-csrf-token':status.body.byok?.csrfToken,'x-ai-request-id':randomUUID()};
  const funded={'x-judu-ai-mode':'owner',cookie:ownerCookie,'x-csrf-token':ownerSession.csrf,'x-ai-request-id':randomUUID()};
  await run({app,owner,byok,calls,logs,personal,funded,ownerCookie,status});
 }finally{globalThis.fetch=oldFetch;console.error=oldError;console.warn=oldWarn;for(const[k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
}

test('ordinary visitors cannot use owner funding, even when the owner key is configured',()=>fixture(async({app,calls})=>{
 assert.equal((await request(app,'/api/chat')).body.code,'AI_MODE_REQUIRED');
 assert.equal((await request(app,'/api/chat',{headers:{'x-judu-ai-mode':'owner'}})).status,401);assert.equal(calls.length,0);
}));

test('an authenticated owner uses only the server key and reserves the owner ledger',()=>fixture(async({app,funded,owner,calls})=>{
 assert.equal((await request(app,'/api/chat',{headers:funded})).status,200);assert.equal(calls[0].authorization,'Bearer '+ownerKey);assert.equal(owner.reserves,1);assert.ok(owner.spent>0);
}));

test('BYOK uses only the supplied key and does not reserve or charge owner money',()=>fixture(async({app,personal,owner,calls,byok})=>{
 const r=await request(app,'/api/chat',{headers:personal});assert.equal(r.status,200);assert.equal(calls[0].authorization,'Bearer '+userKey);assert.ok(!calls[0].payload.includes(userKey));
 assert.equal(owner.reserves,0);assert.equal(owner.spent,0);assert.equal(byok.calls.length,1);assert.ok(!JSON.stringify(byok.calls).includes(userKey));
}));

test('a valid owner cookie cannot make a missing/invalid BYOK key fall back to owner billing',()=>fixture(async({app,personal,ownerCookie,calls,owner})=>{
 for(const authorization of ['', 'Bearer invalid', 'Bearer sk-bad\nkey']){
  const r=await request(app,'/api/chat',{headers:{...personal,cookie:personal.cookie+'; '+ownerCookie,authorization}});assert.ok(r.status>=400);assert.ok(!JSON.stringify(r.body).includes(ownerKey));
 }assert.equal(calls.length,0);assert.equal(owner.reserves,0);
}));

test('owner mode with a supplied user credential is ambiguous and rejected',()=>fixture(async({app,funded,calls,owner})=>{
 const r=await request(app,'/api/chat',{headers:{...funded,authorization:'Bearer '+userKey}});assert.equal(r.body.code,'AI_MODE_REQUIRED');assert.equal(calls.length,0);assert.equal(owner.reserves,0);
}));

for(const [providerStatus,code]of [[401,'BYOK_KEY_INVALID'],[429,'BYOK_PROVIDER_LIMITED'],[500,'AI_UNAVAILABLE']])test(`BYOK provider ${providerStatus} never falls back or discloses credentials`,()=>fixture(async({app,personal,calls,owner,logs})=>{
 const r=await request(app,'/api/chat',{headers:personal});assert.equal(r.body.code,code);assert.equal(calls.length,1);assert.equal(calls[0].authorization,'Bearer '+userKey);
 assert.equal(owner.reserves,0);assert.equal(owner.spent,0);for(const key of [userKey,ownerKey]){assert.ok(!JSON.stringify(r).includes(key));assert.ok(!JSON.stringify(logs).includes(key))}
},{providerStatus}));

test('BYOK works without owner enablement, owner key, owner code or owner budget configuration',()=>fixture(async({app,personal,status,owner,calls})=>{
 assert.equal(status.body.owner.state,'disabled');assert.equal(status.body.byok.enabled,true);
 assert.equal((await request(app,'/api/chat',{headers:personal})).status,200);assert.equal(calls[0].authorization,'Bearer '+userKey);assert.equal(owner.readyCalls,0);assert.equal(owner.reserves,0);
},{env:{AI_BETA_ENABLED:'false',AI_API_KEY:undefined,AI_OWNER_CODE_SHA256:undefined,AI_BETA_BUDGET_USD:undefined,AI_BETA_PRICING_CONFIRMED:undefined}}));

test('owner budget exhaustion does not block or charge BYOK requests',()=>fixture(async({app,personal,funded,owner,calls})=>{
 owner.exhausted=true;assert.equal((await request(app,'/api/chat',{headers:funded})).body.code,'BUDGET_EXHAUSTED');
 assert.equal((await request(app,'/api/chat',{headers:personal})).status,200);assert.equal(calls.length,1);assert.equal(calls[0].authorization,'Bearer '+userKey);assert.equal(owner.spent,0);
}));

test('Redis failures fail each mode closed without switching billing paths',()=>fixture(async({app,personal,funded,owner,byok,calls})=>{
 owner.failed=true;byok.failed=true;
 assert.equal((await request(app,'/api/chat',{headers:funded})).status,503);assert.equal(byok.calls.length,0);
 assert.equal((await request(app,'/api/chat',{headers:personal})).status,503);assert.equal(owner.reserves,0);assert.equal(calls.length,0);
}));

test('BYOK rate limits, schema limits and CSRF are enforced before any provider call',()=>fixture(async({app,personal,byok,calls})=>{
 for(const headers of [{...personal,origin:'https://evil.example'},{...personal,'x-csrf-token':''}])assert.equal((await request(app,'/api/chat',{headers})).status,403);
 assert.equal((await request(app,'/api/chat',{headers:personal,data:{...body,model:'gpt-5'}})).status,400);
 assert.equal((await request(app,'/api/chat',{headers:personal,data:{...body,question:'x'.repeat(3001)}})).status,400);
 assert.equal(byok.calls.length,0);byok.limited=true;assert.equal((await request(app,'/api/chat',{headers:personal})).status,429);assert.equal(calls.length,0);
}));

test('anonymous BYOK session cannot authenticate as owner',()=>fixture(async({app,personal,calls})=>{
 const r=await request(app,'/api/chat',{headers:{...personal,'x-judu-ai-mode':'owner',authorization:''}});assert.equal(r.status,401);assert.equal(calls.length,0);
}));

test('the Redis BYOK adapter never receives credentials, prompts or owner budget keys',async()=>{
 const commands=[],c=byokConfig(environment),store=new RedisByokStore(c,async(_url,options)=>{commands.push(JSON.parse(options.body));return new Response(JSON.stringify({result:'OK'}))});
 await store.readyByok();const lease=await store.reserveByok('client-id','hashed-ip','request-id',60000);await store.finishByok(lease);
 const text=JSON.stringify(commands);for(const absent of [userKey,ownerKey,':budget','input_tokens','sample was stable'])assert.ok(!text.includes(absent));assert.ok(text.includes(':byok:'));
});

test('tab key memory is isolated, clearable, empty on a fresh tab and never returned as display text',()=>{
 const tab=createTabKey(),nextTab=createTabKey();tab.set(userKey);assert.equal(tab.get(),userKey);assert.equal(nextTab.get(),'');assert.equal(JSON.stringify(tab),'{}');tab.clear();assert.equal(tab.get(),'');
 assert.throws(()=>tab.set('invalid'),/valid OpenAI API key/);
});

test('client headers require explicit modes and never fall back when key or HTTPS is missing',()=>{
 assert.throws(()=>aiHeaders('none',undefined,undefined,randomUUID(),true),/Choose Owner AI/);
 assert.throws(()=>aiHeaders('byok','csrf','',randomUUID(),true),/your own/);
 assert.throws(()=>aiHeaders('byok','csrf',userKey,randomUUID(),false),/HTTPS/);
 assert.throws(()=>aiHeaders('owner','csrf',userKey,randomUUID(),true),/one AI billing mode/);
 const personal=aiHeaders('byok','csrf',userKey,randomUUID(),true),owner=aiHeaders('owner','csrf',undefined,randomUUID(),true);
 assert.equal(personal.Authorization,'Bearer '+userKey);assert.equal(owner.Authorization,undefined);assert.equal(owner['X-Judu-AI-Mode'],'owner');
});

test('an explicit empty SDK key option cannot fall through to an owner/environment key',()=>fixture(async({calls})=>{
 await assert.rejects(()=>callAI({...body,task:'chat'},{apiKey:undefined}),/key is required/);assert.equal(calls.length,0);
}));

test('BYOK cannot select the legacy localhost environment-key path',()=>fixture(async({app,personal,calls,owner})=>{
 const r=await request(app,'/api/chat',{headers:{...personal,host:'localhost:4173',origin:'http://localhost:4173'}});
 assert.equal(r.body.code,'BYOK_DISABLED');assert.equal(calls.length,0);assert.equal(owner.reserves,0);
},{env:{NODE_ENV:'development',VERCEL:undefined}}));

test('owner Redis failure does not implicitly select an otherwise available BYOK path',()=>fixture(async({app,funded,owner,byok,calls})=>{
 owner.failed=true;assert.equal((await request(app,'/api/chat',{headers:funded})).status,503);assert.equal(byok.calls.length,0);assert.equal(calls.length,0);
}));

test('all three AI routes use BYOK without ambient owner project/organization headers or cross-key caches',()=>fixture(async({app,personal,owner,calls})=>{
 for(const task of ['chat','analyze','word']){
  const r=await request(app,'/api/'+task,{headers:{...personal,'x-ai-request-id':randomUUID()},data:{...body,word:'stable'}});
  assert.equal(r.status,200);assert.equal(calls.at(-1).authorization,'Bearer '+userKey);
  assert.equal(calls.at(-1).organization,null);assert.equal(calls.at(-1).project,null);
  assert.ok(!JSON.stringify(r).includes(userKey));assert.equal(r.body.usage.sessionEstimatedUSD,undefined);
 }
 const nextKey='sk-test-only-another-personal-key-123456789';
 assert.equal((await request(app,'/api/chat',{headers:{...personal,authorization:'Bearer '+nextKey,'x-ai-request-id':randomUUID()}})).status,200);
 assert.equal(calls.length,4);assert.equal(calls.at(-1).authorization,'Bearer '+nextKey);assert.equal(owner.reserves,0);assert.equal(owner.spent,0);
},{env:{OPENAI_ORG_ID:'test-only-owner-org',OPENAI_PROJECT_ID:'test-only-owner-project'}}));

test('BYOK configuration is separately default-off and every common setting is required',()=>{
 assert.throws(()=>byokConfig({...environment,AI_BYOK_ENABLED:undefined}),e=>e.code==='BYOK_DISABLED');
 for(const name of ['AI_MODEL','AI_MAX_OUTPUT_TOKENS','AI_BETA_ORIGIN','AI_BETA_SESSION_SECRET','AI_BETA_REDIS_REST_URL','AI_BETA_REDIS_REST_TOKEN'])assert.throws(()=>byokConfig({...environment,[name]:undefined}),e=>e.code==='AI_UNAVAILABLE');
 for(const patch of [{AI_MODEL:'gpt-5'},{AI_BETA_ORIGIN:'http://reading-aid.vercel.app'},{AI_BETA_REDIS_REST_URL:'http://redis.example.test'},{AI_MAX_OUTPUT_TOKENS:'8001'}])assert.throws(()=>byokConfig({...environment,...patch}),e=>e.code==='AI_UNAVAILABLE');
});

test('BYOK uses only its anonymous secure cookie and rejects expired or mismatched sessions',()=>fixture(async({app,personal,status,calls})=>{
 const cookie=[status.headers['set-cookie']].flat().find(s=>s.startsWith(BYOK_COOKIE+'='));
 for(const attribute of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=28800'])assert.ok(cookie.includes(attribute));
 const expired=sessionCookie(issueByokSession(byokConfig(environment),Date.now()-(SESSION_SECONDS+1)*1000),undefined,BYOK_COOKIE).split(';')[0];
 for(const cookieValue of ['',personal.cookie+'x',expired])assert.equal((await request(app,'/api/chat',{headers:{...personal,cookie:cookieValue}})).body.code,'BYOK_SESSION_INVALID');
 assert.equal(calls.length,0);assert.ok(!JSON.stringify(status).includes(userKey));
}));
