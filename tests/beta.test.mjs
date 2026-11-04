import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IncomingMessage,ServerResponse} from 'node:http';
import {Duplex} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createApp} from '../server/app.mjs';
import {createBetaService,maximumCost,validateBetaRequest} from '../server/beta.mjs';
import {betaConfig,BetaError,digest,issueSession,sessionCookie,verifySession,SESSION_SECONDS} from '../server/beta-config.mjs';
import {RedisBetaStore,RESERVE,FINISH,BUDGET_KEY} from '../server/beta-store.mjs';
import {prepareAIRequest} from '../server/ai.mjs';

// Test credentials are intentionally fake. Tests never open sockets/listeners.
const code='a'.repeat(43),otherCode='b'.repeat(43);
const environment={NODE_ENV:'production',VERCEL:'1',AI_BETA_ENABLED:'true',AI_BETA_PRICING_CONFIRMED:'true',AI_BETA_ORIGIN:'https://reading-aid.vercel.app',AI_API_KEY:'test-only-not-a-real-key',AI_MODEL:'gpt-5-mini',AI_MAX_OUTPUT_TOKENS:'2500',AI_INPUT_USD_PER_MILLION:'.25',AI_CACHED_INPUT_USD_PER_MILLION:'.025',AI_OUTPUT_USD_PER_MILLION:'2',AI_BETA_BUDGET_USD:'5',AI_BETA_SESSION_SECRET:'test-only-signing-secret-'.repeat(3),AI_BETA_INVITES_JSON:JSON.stringify({alice:digest(code),bob:digest(otherCode)}),AI_BETA_REDIS_REST_URL:'https://redis.example.test',AI_BETA_REDIS_REST_TOKEN:'test-only-redis-credential'};
const payload={sources:[{id:'S1',page:1,text:'The temperature was 25 °C.'}],question:'Explain it',history:[],document:{title:'Test paper',fileName:'test.pdf',page:1}};
const headers={origin:environment.AI_BETA_ORIGIN,'content-type':'application/json','sec-fetch-site':'same-origin'};
function request(app,path,{method='POST',body={},headers:extra={},ip='127.0.0.1',raw}={}){
 return new Promise((resolve,reject)=>{
  const socket=new Duplex({read(){},write(_chunk,_encoding,callback){callback()}});socket.remoteAddress=ip;
  const req=new IncomingMessage(socket);req.method=method;req.url=path;
  const bytes=Buffer.from(raw??JSON.stringify(body));req.headers={host:'reading-aid.vercel.app',...headers,...extra,...(method==='POST'?{'content-length':String(bytes.length)}:{})};
  const res=new ServerResponse(req);const timer=setTimeout(()=>reject(Error('handler did not finish')),3000);
  res.end=function(data){clearTimeout(timer);this.finished=true;resolve({status:this.statusCode,headers:this.getHeaders(),body:data?JSON.parse(String(data)):null});return this};
  app.handle(req,res);if(method==='POST')req.push(bytes);req.push(null);
 });
}
class Ledger{
 constructor(c){this.c=c;this.spent=0;this.held=0;this.records=new Map();this.per=new Map();this.global=0;this.login=0;this.failed=false;this.settleFailed=false}
 check(){if(this.failed)throw new BetaError('AI_UNAVAILABLE')}
 async ready(){this.check()}
 async authorize(id,hash){this.check();if(this.c.invites[id]!==hash)throw new BetaError('SESSION_INVALID')}
 async attempt(){this.check();if(++this.login>5)throw new BetaError('RATE_LIMITED')}
 async reserve(id,key,amount,_now,hash){this.check();await this.authorize(id,hash);key=id+key;if(this.records.has(key))throw new BetaError('DUPLICATE_REQUEST');if(this.spent+this.held+amount>this.c.budgetMicros)throw new BetaError('BUDGET_EXHAUSTED');if((this.per.get(id)||0)>=5||this.global>=20)throw new BetaError('RATE_LIMITED');this.per.set(id,(this.per.get(id)||0)+1);this.global++;this.held+=amount;const r={id,key,amount,state:'held'};this.records.set(key,r);return r}
 async finish(r,actual,usage){this.check();if(this.settleFailed)throw new BetaError('AI_UNAVAILABLE');if(r.state!=='held')return;if(actual===null){r.state='unknown';return}this.held-=r.amount;this.spent+=actual;r.state='settled';r.actual=actual;r.usage=usage}
}
async function fixture(run,{env={},ai,providerStatus='completed'}={}){
 const vars={...environment,...env},old={};for(const k of Object.keys(vars)){old[k]=process.env[k];if(vars[k]===undefined)delete process.env[k];else process.env[k]=vars[k]}
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses');calls++;const data=JSON.parse(options.body);assert.equal(data.model,'gpt-5-mini');assert.equal(data.store,false);
  const answer=data.input[0].content.includes('"uncertainties"')?{translation:'测试翻译',uncertainties:[],terms:[],structure:{backbone:'测试',explanation:'测试'},reminders:[]}:{answer:'The result is stable. [S1]',citations:['S1']};
  return new Response(JSON.stringify({id:'test',object:'response',status:providerStatus,output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(answer)}]}],usage:{input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:100},output_tokens_details:{reasoning_tokens:50}}}),{headers:{'Content-Type':'application/json'}});
 };
 try{
  let c;try{c=betaConfig()}catch{c={...betaConfig(environment)}}
  const ledger=new Ledger(c),beta=createBetaService({store:()=>ledger,...(ai?{ai}:{})}),app=createApp({beta});
  const cookie=sessionCookie(issueSession('alice',c)).split(';')[0];
  const session=verifySession({get:k=>k==='cookie'?cookie:undefined},c);
  const auth={cookie,'x-csrf-token':session.csrf,'x-ai-request-id':randomUUID()};
  await run({app,c,ledger,auth,beta,calls:()=>calls});
 }finally{globalThis.fetch=originalFetch;for(const [k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
}

test('production paid routes stay disabled by default, including when a key exists',()=>fixture(async({app,calls})=>{
 for(const task of ['chat','analyze','word']){const r=await request(app,'/api/'+task,{body:payload});assert.equal(r.status,403);assert.equal(r.body.code,'AI_DISABLED');assert.match(r.body.error,/Paid AI is restricted/)}
 assert.equal(calls(),0);assert.equal((await request(app,'/api/status',{method:'GET'})).body.configured,false);
},{env:{AI_BETA_ENABLED:undefined}}));

test('every required production setting fails closed when missing or invalid',()=>{
 for(const key of Object.keys(environment).filter(k=>!['NODE_ENV','VERCEL'].includes(k))){assert.throws(()=>betaConfig({...environment,[key]:undefined}),BetaError,key)}
 for(const patch of [{AI_MODEL:'gpt-5'},{AI_BETA_ORIGIN:'http://reading-aid.vercel.app'},{AI_BETA_REDIS_REST_URL:'http://redis.example.test'},{AI_BETA_SESSION_SECRET:'short'},{AI_BETA_INVITES_JSON:'{}'},{AI_BETA_BUDGET_USD:'NaN'},{AI_OUTPUT_USD_PER_MILLION:''}])assert.throws(()=>betaConfig({...environment,...patch}),BetaError);
});

test('valid invite issues an expiring secure cookie and never returns the raw code',()=>fixture(async({app})=>{
 const r=await request(app,'/api/beta/login',{body:{code}});assert.equal(r.status,200);const cookie=r.headers['set-cookie'];
 for(const attribute of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=28800'])assert.ok(cookie.includes(attribute));
 assert.ok(!JSON.stringify(r).includes(code));
 const status=await request(app,'/api/status',{method:'GET',headers:{cookie:cookie.split(';')[0]}});
 assert.equal(status.body.configured,true);assert.equal(status.body.beta.authenticated,true);assert.ok(status.body.beta.csrfToken);
 assert.equal(status.body.sessionEstimatedUSD,undefined);assert.equal(status.body.sessionRequests,undefined);
}));

test('invalid invites are rejected and invalid attempts are durably limited',()=>fixture(async({app,calls,ledger})=>{
 for(let i=0;i<5;i++)assert.equal((await request(app,'/api/beta/login',{body:{code:'z'.repeat(43)}})).body.code,'INVALID_INVITE');
 const r=await request(app,'/api/beta/login',{body:{code}});assert.equal(r.status,429);assert.equal(r.body.code,'RATE_LIMITED');assert.equal(ledger.login,6);assert.equal(calls(),0);
}));

test('expired, tampered and revoked sessions cannot authenticate',()=>fixture(async({app,c,auth,calls})=>{
 const expired=sessionCookie(issueSession('alice',c,Date.now()-(SESSION_SECONDS+1)*1000)).split(';')[0];
 for(const [cookie,expected]of [[expired,'SESSION_EXPIRED'],[auth.cookie+'x','SESSION_INVALID']]){const r=await request(app,'/api/chat',{body:payload,headers:{...auth,cookie}});assert.equal(r.status,401);assert.equal(r.body.code,expected)}
 const rotated={...c,invites:{...c.invites,alice:digest('revoked')}};assert.throws(()=>verifySession({get:()=>auth.cookie},rotated),BetaError);assert.equal(calls(),0);
}));

test('all paid endpoints require session and CSRF; missing or cross-site Origin is denied',()=>fixture(async({app,auth,calls})=>{
 for(const task of ['chat','analyze','word']){const r=await request(app,'/api/'+task,{body:payload});assert.equal(r.status,401)}
 for(const extra of [{...auth,'x-csrf-token':''},{...auth,origin:'https://evil.example'},{...auth,origin:''},{...auth,'content-type':'text/plain'}]){
  const r=await request(app,'/api/chat',{body:payload,headers:extra});assert.equal(r.status,403);
 }
 assert.equal(calls(),0);
}));

test('successful paid request reserves before OpenAI, settles actual usage and hides global totals',()=>fixture(async({app,auth,ledger,calls})=>{
 const r=await request(app,'/api/chat',{body:payload,headers:auth});assert.equal(r.status,200);assert.equal(calls(),1);
 assert.ok(ledger.spent>0);assert.equal(ledger.held,0);const record=[...ledger.records.values()][0];assert.ok(record.amount>record.actual);assert.equal(record.state,'settled');
 assert.equal(r.body.usage.sessionEstimatedUSD,undefined);assert.equal(r.headers['cache-control'],'private, no-store');
 assert.equal((await request(app,'/api/chat',{body:payload,headers:auth})).body.code,'DUPLICATE_REQUEST');assert.equal(calls(),1);
}));

test('per-invite and global limits block additional provider calls',()=>fixture(async({app,auth,ledger,calls})=>{
 ledger.per.set('alice',5);assert.equal((await request(app,'/api/chat',{body:payload,headers:auth})).body.code,'RATE_LIMITED');
 ledger.per.clear();ledger.global=20;assert.equal((await request(app,'/api/chat',{body:payload,headers:auth})).body.code,'RATE_LIMITED');assert.equal(calls(),0);
}));

test('budget exhaustion and durable-store failure prevent all OpenAI calls',()=>fixture(async({app,auth,ledger,calls})=>{
 ledger.spent=ledger.c.budgetMicros;assert.equal((await request(app,'/api/chat',{body:payload,headers:auth})).body.code,'BUDGET_EXHAUSTED');
 ledger.failed=true;assert.equal((await request(app,'/api/chat',{body:payload,headers:auth})).status,503);assert.equal(calls(),0);
 assert.equal((await request(app,'/api/beta/login',{body:{code}})).status,503);
}));

test('timeout, disconnect and unknown billing never refund a held reservation',()=>fixture(async({app,auth,ledger})=>{
 const r=await request(app,'/api/chat',{body:payload,headers:auth});assert.equal(r.status,503);assert.ok(ledger.held>0);assert.equal([...ledger.records.values()][0].state,'unknown');assert.equal(ledger.spent,0);
},{ai:async()=>{throw Object.assign(Error('timeout'),{name:'AbortError'})}}));

test('settlement failure keeps the maximum reservation and withholds success',()=>fixture(async({app,auth,ledger,calls})=>{
 ledger.settleFailed=true;const r=await request(app,'/api/chat',{body:payload,headers:auth});assert.equal(r.status,503);assert.equal(calls(),1);assert.ok(ledger.held>0);
}));

test('malformed and oversized requests are rejected before reservation or OpenAI',()=>fixture(async({app,auth,ledger,calls})=>{
 const bad=[null,{}, {...payload,model:'gpt-5'}, {...payload,question:'x'.repeat(3001)}, {...payload,history:Array(5).fill({role:'user',content:'a'})}, {...payload,sources:[null]}, {...payload,sources:[{id:'S1',page:1,text:'x'.repeat(12001)}]}, {...payload,document:{title:'x'.repeat(501)}}];
 for(const body of bad)assert.equal((await request(app,'/api/chat',{body,headers:auth})).status,400);
 assert.equal((await request(app,'/api/chat',{headers:auth,raw:'{broken'})).status,400);
 assert.equal((await request(app,'/api/chat',{headers:auth,raw:JSON.stringify({...payload,question:'x'.repeat(210000)})})).status,400);
 assert.equal(ledger.records.size,0);assert.equal(calls(),0);
}));

test('public API responses contain no configured secrets or private global accounting',()=>fixture(async({app,c})=>{
 for(const path of ['/api/status','/api/beta/session']){const r=await request(app,path,{method:'GET'});const json=JSON.stringify(r);for(const secret of [environment.AI_API_KEY,c.secret,c.redisToken,...Object.values(c.invites),code])assert.ok(!json.includes(secret));assert.ok(!json.includes('sessionEstimatedUSD'))}
}));

test('maximum reservation includes full serialized prompt and all output tokens; input cannot choose model',()=>{
 const c=betaConfig(environment),p=prepareAIRequest(validateBetaRequest('chat',payload));assert.ok(maximumCost(p.input,c)>=8192*c.pricing.input+c.maxOutputTokens*c.pricing.output);
 assert.throws(()=>validateBetaRequest('chat',{...payload,model:'gpt-5'}),BetaError);
 assert.throws(()=>maximumCost([{content:'汉'.repeat(100000)}],c),BetaError);
});

test('Redis adapter sends atomic EVAL operations and sanitizes upstream failures',async()=>{
 const c=betaConfig(environment);const sent=[];const store=new RedisBetaStore(c,async(_url,options)=>{sent.push(JSON.parse(options.body));return new Response(JSON.stringify({result:'OK'}))});
 const r=await store.reserve('alice','id',5000,60000);await store.finish(r,100,{input_tokens:100,output_tokens:10});
 assert.equal(sent[0][1],RESERVE);assert.equal(sent[0][3],BUDGET_KEY);assert.equal(sent[1][1],FINISH);
 const broken=new RedisBetaStore(c,async()=>{throw Error('secret Redis failure '+c.redisToken)});
 await assert.rejects(()=>broken.ready(),e=>e.code==='AI_UNAVAILABLE'&&!e.message.includes(c.redisToken));
});

test('direct localhost remains usable without beta configuration or Redis',()=>fixture(async({app,calls})=>{
 const r=await request(app,'/api/chat',{body:payload,headers:{host:'localhost:4173',origin:'http://localhost:4173'}});assert.equal(r.status,200);assert.equal(calls(),1);
 const forwarded=await request(app,'/api/chat',{body:payload,headers:{host:'localhost:4173',origin:'http://localhost:4173','x-forwarded-for':'127.0.0.1'}});assert.equal(forwarded.status,403);
},{env:{NODE_ENV:'development',VERCEL:undefined,AI_BETA_ENABLED:undefined}}));

test('all three existing AI tasks remain usable after beta authentication',()=>fixture(async({app,auth,calls})=>{
 for(const task of ['chat','analyze','word']){
  const r=await request(app,'/api/'+task,{body:{...payload,...(task==='word'?{word:'temperature'}:{})},headers:{...auth,'x-ai-request-id':randomUUID()}});
  assert.equal(r.status,200);assert.ok(task==='analyze'?r.body.analysis:r.body.answer);
 }
 assert.equal(calls(),3);
}));

test('durable revocation denies an old deployment/session while another invite remains valid',()=>fixture(async({app,auth,c,ledger,calls})=>{
 const bob=sessionCookie(issueSession('bob',c)).split(';')[0];delete ledger.c.invites.alice;
 assert.equal((await request(app,'/api/chat',{body:payload,headers:auth})).body.code,'SESSION_INVALID');
 assert.equal((await request(app,'/api/status',{method:'GET',headers:{cookie:bob}})).body.configured,true);
 assert.equal(calls(),0);
}));

test('a store timeout after reservation acknowledgement is lost cannot start a provider call',()=>fixture(async({app,auth,ledger,calls})=>{
 const reserve=ledger.reserve.bind(ledger);ledger.reserve=async(...args)=>{await reserve(...args);throw new BetaError('AI_UNAVAILABLE')};
 assert.equal((await request(app,'/api/chat',{body:payload,headers:auth})).status,503);
 assert.equal(calls(),0);assert.ok(ledger.held>0);
}));

test('client disconnect aborts the provider signal while preserving its maximum reservation',async()=>{
 const res=new EventEmitter();res.destroyed=false;
 await fixture(async({beta,auth,ledger})=>{
  const req={body:payload,get:key=>({...headers,...auth})[key],socket:{remoteAddress:'127.0.0.1'}};
  await assert.rejects(()=>beta.paid(req,res,'chat'),e=>e.code==='AI_UNAVAILABLE');
  assert.ok(ledger.held>0);assert.equal([...ledger.records.values()][0].state,'unknown');
 },{ai:async({signal})=>{res.emit('close');assert.equal(signal.aborted,true);throw Object.assign(Error('canceled'),{name:'AbortError'})}});
});

test('known provider usage is settled even when answer validation subsequently fails',()=>fixture(async({app,auth,ledger})=>{
 const r=await request(app,'/api/chat',{body:payload,headers:auth});assert.equal(r.status,503);assert.equal(ledger.held,0);assert.ok(ledger.spent>0);
},{ai:async(_args,options)=>{await options.onUsage({input_tokens:1000,output_tokens:200});throw Error('bad provider JSON')}}));

test('missing provider usage and unexpected failures never disclose prompts or credentials',()=>fixture(async({app,auth,ledger})=>{
 const r=await request(app,'/api/chat',{body:payload,headers:auth});assert.equal(r.status,503);assert.ok(ledger.held>0);
 assert.ok(!JSON.stringify(r.body).includes('private prompt'));assert.ok(!JSON.stringify(r.body).includes(environment.AI_API_KEY));
},{ai:async(_args,options)=>{await options.onUsage(undefined);throw Error(environment.AI_API_KEY+' private prompt')}}));

test('logout clears the secure cookie without touching reader data',()=>fixture(async({app,auth})=>{
 const r=await request(app,'/api/beta/logout',{headers:auth});assert.equal(r.status,200);assert.ok(r.headers['set-cookie'].includes('Max-Age=0'));assert.deepEqual(r.body,{authenticated:false});
}));

test('misconfigured model values are not echoed by public production status',()=>fixture(async({app})=>{
 const r=await request(app,'/api/status',{method:'GET'});assert.equal(r.body.configured,false);assert.equal(r.body.model,'gpt-5-mini');assert.ok(!JSON.stringify(r.body).includes(environment.AI_API_KEY));
},{env:{AI_MODEL:environment.AI_API_KEY}}));

test('SDK endpoint and logging cannot be redirected by inherited OpenAI environment settings',()=>fixture(async({app,auth,calls})=>{
 assert.equal((await request(app,'/api/chat',{body:payload,headers:auth})).status,200);assert.equal(calls(),1);
},{env:{OPENAI_BASE_URL:'https://untrusted.example.test',OPENAI_LOG:'debug'}}));

test('nonfinal provider status cannot settle/refund a potentially still-running request',()=>fixture(async({app,auth,ledger})=>{
 assert.equal((await request(app,'/api/chat',{body:payload,headers:auth})).status,503);assert.equal(ledger.spent,0);assert.ok(ledger.held>0);
},{providerStatus:'in_progress'}));
