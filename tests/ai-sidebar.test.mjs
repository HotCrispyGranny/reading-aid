import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IncomingMessage,ServerResponse} from 'node:http';
import {Duplex} from 'node:stream';
import {createApp} from '../server/app.mjs';
import {normalizeAIStatus} from '../src/lib/ai-ui-state.mjs';
import * as aiAccess from '../src/lib/ai-access.mjs';
import {componentHarness,nodes,text} from './support/react-harness.mjs';

const keyA='sk-test-only-personal-key-AAAAAAAA',keyB='sk-test-only-personal-key-BBBBBBBB';
const source={id:'S1',sentenceId:'s1',page:1,text:'The sample was stable.'};
const production={configured:false,owner:{enabled:false,authenticated:false,state:'disabled'},byok:{enabled:true,state:'available',csrfToken:'test-csrf'}};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const button=(tree,name)=>{const found=nodes(tree).find(n=>n.type==='button'&&(text(n)===name||n.props['aria-label']===name));assert.ok(found,'Missing button '+name);return found};
const field=tree=>nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='Your OpenAI API key');
function accessHarness(protocol='https:'){return componentHarness(new URL('../src/components/BetaAIAccess.tsx',import.meta.url),{}, {window:{location:{protocol}}})}
function publicProps(status=normalizeAIStatus(production)){return {status:status.owner,byok:status.byok,mode:'none',hasKey:false,refresh:async()=>{},setKey(){},clearKey(){},selectOwner(){},selectByok(){}}}
function localRequest(app,path,method='GET'){
 return new Promise((resolve,reject)=>{
  const socket=new Duplex({read(){},write(_d,_e,cb){cb()}});socket.remoteAddress='127.0.0.1';
  const req=new IncomingMessage(socket);req.method=method;req.url=path;
  const payload=JSON.stringify({sources:[source],question:'Explain it'});
  req.headers={host:'localhost:4173',origin:'http://localhost:4173','content-type':'application/json','x-judu-ai-mode':'local',...(method==='POST'?{'content-length':String(Buffer.byteLength(payload))}:{})};
  const res=new ServerResponse(req),timer=setTimeout(()=>reject(Error('handler timed out')),3000);
  res.end=function(value){clearTimeout(timer);this.finished=true;resolve({status:this.statusCode,body:JSON.parse(String(value))});return this};
  app.handle(req,res);if(method==='POST')req.push(Buffer.from(payload));req.push(null);
 });
}
async function fixture(run,{mode='byok',status=production,protocol='https:'}={}){
 const oldFetch=globalThis.fetch,calls=[];let key=mode==='byok'?keyA:'',revision=0;
 const state=normalizeAIStatus(status);
 const p={doc:{id:'doc',name:'fixture.pdf',page:1,messages:[],analyses:{},notes:[],marks:[],words:[]},current:{...source,id:'s1',runs:[],context:source.text,blockId:'b1',complete:true},sentences:[],pages:[],complete:true,configured:mode!=='none',aiMode:mode,betaStatus:mode==='owner'?{enabled:true,authenticated:true,state:'authenticated',csrfToken:'owner-csrf'}:state.owner,byokStatus:state.byok,hasByokKey:!!key,byokRevision:revision,getByokRevision:()=>revision,getByokKey:()=>key,tab:'chat',width:310,refreshAIStatus:async()=>{},selectOwner(){p.aiMode='owner'},selectByok(){p.aiMode='byok'},setTab(tab){p.tab=tab}};
 p.patch=fn=>{p.doc=fn(p.doc)};
 p.setByokKey=value=>{key=value;revision++;p.byokRevision=revision;p.hasByokKey=true;p.aiMode='byok';p.configured=true};
 p.clearByokKey=()=>{key='';revision++;p.byokRevision=revision;p.hasByokKey=false;p.aiMode='byok';p.configured=false};
 globalThis.fetch=(url,options)=>{
  if(url==='/api/status')return Promise.resolve(response(status));
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});calls.push({url,options,resolve,reject});return promise;
 };
 const h=componentHarness(new URL('../src/components/StudyPanel.tsx',import.meta.url),{
  './ChatGPTBridge':{default:()=>null},'./BetaAIAccess':{default:()=>null},'@phosphor-icons/react':new Proxy({},{get:()=>()=>null}),
  '../lib/ai-access.mjs':aiAccess,'../lib/context':{buildContext:()=>({sources:[source],coverage:'Current sentence'})},'../lib/storage':{},'../lib/labels':{label:x=>x,noteOriginLabel:x=>x},
 },{window:{location:{protocol}}});
 const render=(effects=true)=>h.render(p,effects);
 const send=async(question='Explain this')=>{let tree=render();nodes(tree).find(n=>n.type==='textarea'&&n.props['aria-label']==='Ask about this paper').props.onChange({target:{value:question}});tree=render();nodes(tree).find(n=>n.type==='form'&&n.props.className==='chat-compose').props.onSubmit({preventDefault(){}});await tick();return render()};
 try{await run({p,h,calls,render,send})}finally{h.unmount();globalThis.fetch=oldFetch}
}

test('actual local status omission retains access UI without offering localhost BYOK; missing server key never calls provider',async()=>{
 const names=['NODE_ENV','VERCEL','AI_API_KEY'],old=Object.fromEntries(names.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;let provider=0;
 try{
  process.env.NODE_ENV='development';delete process.env.VERCEL;delete process.env.AI_API_KEY;
  globalThis.fetch=async()=>{provider++;throw Error('Provider must not be called')};
  const app=createApp(),raw=await localRequest(app,'/api/status');assert.equal(raw.body.owner,undefined);assert.equal(raw.body.byok,undefined);
  const unavailable=await localRequest(app,'/api/chat','POST');assert.equal(unavailable.status,503);assert.equal(provider,0);
  const normalized=normalizeAIStatus(raw.body);assert.equal(normalized.byok.enabled,false);assert.equal(normalized.byok.state,'local_unavailable');
  const a=accessHarness('http:'),props=publicProps(normalized);let tree=a.render(props);button(tree,'Set up').props.onClick();tree=a.render(props);
  assert.match(text(tree),/unavailable on this local development backend/);assert.equal(field(tree),undefined);assert.ok(!nodes(tree).some(n=>n.type==='button'&&text(n)==='Use key for this tab'));
  await fixture(async({p,render,calls})=>{p.configured=false;const tree=render();assert.ok(nodes(tree).some(n=>n.props?.byok?.state==='local_unavailable'&&typeof n.props.setKey==='function'));assert.equal(calls.length,0)},{mode:'local',status:raw.body,protocol:'http:'});
 }finally{globalThis.fetch=oldFetch;for(const k of names)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}
});

test('production public setup is independent of owner availability and preserves compact/expanded behavior',()=>{
 const a=accessHarness(),p=publicProps();let tree=a.render(p);assert.match(text(tree),/AI Assistant/);assert.equal(nodes(tree).find(n=>n.props.className==='ai-access-body').props.hidden,true);
 button(tree,'Set up').props.onClick();tree=a.render(p);assert.ok(field(tree));assert.match(text(tree),/billed to the account/);button(tree,'Collapse').props.onClick();assert.equal(nodes(a.render(p)).find(n=>n.props.className==='ai-access-body').props.hidden,true);
});

test('Manage can replace an invalid key without dropping it first; remove returns to compact setup',()=>{
 const a=accessHarness(),p={...publicProps(),hasKey:true,mode:'byok'};let current=keyA;
 p.setKey=value=>{current=value};p.clearKey=()=>{current='';p.hasKey=false};
 let tree=a.render(p);assert.match(text(tree),/Personal AI ready · gpt-5-mini/);button(tree,'Manage').props.onClick();tree=a.render(p);button(tree,'Collapse').props.onClick();tree=a.render(p);assert.equal(current,keyA);button(tree,'Manage').props.onClick();tree=a.render(p);button(tree,'Replace key').props.onClick();tree=a.render(p);assert.equal(current,keyA);assert.ok(field(tree));
 field(tree).props.onChange({target:{value:keyB}});tree=a.render(p);nodes(tree).find(n=>n.type==='form'&&text(n).includes('Use key for this tab')).props.onSubmit({preventDefault(){}});tree=a.render(p);assert.equal(current,keyB);button(tree,'Manage').props.onClick();tree=a.render(p);button(tree,'Remove key').props.onClick();tree=a.render(p);assert.equal(current,'');button(tree,'Set up');assert.equal(nodes(tree).find(n=>n.props.className==='ai-access-body').props.hidden,true);
});

for(const mode of ['local','owner'])test(`${mode} errors disappear immediately on public/BYOK access changes`,()=>fixture(async({p,calls,render,send})=>{
 await send();calls[0].resolve(response({error:'OpenAI authentication failed. Check the server key.'},502));await tick();assert.match(text(render()),mode==='owner'?/Owner AI:/:/Local AI:/);
 p.aiMode='none';p.configured=false;assert.doesNotMatch(text(render(false)),/Check the server key/);
 p.setByokKey(keyA);assert.doesNotMatch(text(render()),/Check the server key/);assert.ok(nodes(render()).some(n=>n.props?.hasKey&&typeof n.props.clearKey==='function'));
},{mode}));

for(const action of ['replace','remove'])test(`BYOK error is scoped to the key revision and clears on ${action}`,()=>fixture(async({p,calls,render,send})=>{
 await send();calls[0].resolve(response({error:'OpenAI authentication failed. Check the server key.',code:'BYOK_KEY_INVALID'},401));await tick();let tree=render();assert.match(text(tree),/Personal AI: Your OpenAI API key was rejected/);assert.doesNotMatch(text(tree),/server key/);
 assert.ok(nodes(tree).some(n=>n.props?.hasKey&&typeof n.props.clearKey==='function'));assert.equal(calls.length,1);assert.equal(calls[0].options.headers['X-Judu-AI-Mode'],'byok');assert.equal(calls[0].options.headers.Authorization,'Bearer '+keyA);
 if(action==='replace')p.setByokKey(keyB);else p.clearByokKey();assert.doesNotMatch(text(render(false)),/was rejected/);assert.ok(!JSON.stringify(p.doc).includes(keyA));
}));

for(const mode of ['local','owner'])test(`late ${mode} success/error after mode change cannot update conversation, error or usage`,()=>fixture(async({p,calls,render,send})=>{
 await send();p.setByokKey(keyA);render(false);calls[0].resolve(response({answer:'OBSOLETE OWNER ANSWER',usage:{model:'old-model'},sources:[source]}));await tick();assert.equal(p.doc.messages.filter(m=>m.role==='assistant').length,0);assert.doesNotMatch(text(render()),/OBSOLETE|old-model/);
 await send('New personal request');calls[1].resolve(response({answer:'Current personal answer',sources:[source]}));await tick();assert.match(text(render()),/Current personal answer/);assert.equal(calls[1].options.headers['X-Judu-AI-Mode'],'byok');
},{mode}));

for(const mode of ['local','owner'])test(`obsolete ${mode} authentication failure cannot refresh or overwrite new BYOK access`,()=>fixture(async({p,calls,render,send})=>{
 let refreshes=0;p.refreshAIStatus=async()=>{refreshes++};await send();p.setByokKey(keyA);render(false);
 calls[0].resolve(response({error:'OBSOLETE SERVER KEY FAILURE'},401));await tick();assert.equal(refreshes,0);assert.doesNotMatch(text(render()),/OBSOLETE/);assert.equal(p.aiMode,'byok');
},{mode}));

for(const action of ['replace','remove'])test(`late BYOK success after ${action} is ignored even before re-render and when transport ignores abort`,()=>fixture(async({p,calls,render,send})=>{
 await send();if(action==='replace')p.setByokKey(keyB);else p.clearByokKey();
 // Do not render yet: the synchronous opaque revision check must suffice.
 calls[0].resolve(response({answer:'OBSOLETE PERSONAL ANSWER',sources:[source]}));await tick();assert.equal(p.doc.messages.filter(m=>m.role==='assistant').length,0);assert.doesNotMatch(text(render()),/OBSOLETE/);
}));

test('an obsolete failed request cannot overwrite a newer request error or question',()=>fixture(async({p,calls,render,send})=>{
 await send('Old question');p.setByokKey(keyB);render();await send('New question');
 calls[1].resolve(response({error:'Current personal quota issue',code:'BYOK_PROVIDER_LIMITED'},429));await tick();calls[0].reject(Error('OBSOLETE AUTH FAILURE'));await tick();const tree=render();assert.match(text(tree),/Current personal quota issue/);assert.doesNotMatch(text(tree),/OBSOLETE/);assert.equal(nodes(tree).find(n=>n.type==='textarea'&&n.props['aria-label']==='Ask about this paper').props.value,'New question');
}));

test('late analysis after key replacement cannot populate analysis caches or errors',()=>fixture(async({p,calls,render})=>{
 p.tab='analysis';button(render(),'Analyze sentence').props.onClick();assert.equal(calls.length,1);p.setByokKey(keyB);render(false);calls[0].resolve(response({analysis:{translation:'OBSOLETE ANALYSIS'}}));await tick();assert.deepEqual(p.doc.analyses,{});assert.doesNotMatch(text(render()),/OBSOLETE/);
}));

test('capability/session changes invalidate outstanding requests without changing billing modes',()=>fixture(async({p,calls,render,send})=>{
 await send();p.byokStatus={...p.byokStatus,csrfToken:'rotated-test-csrf'};render(false);calls[0].reject(Error('OBSOLETE SESSION'));await tick();assert.doesNotMatch(text(render()),/OBSOLETE/);assert.equal(calls.length,1);assert.equal(p.aiMode,'byok');
}));

test('disabled owner capability objects never label local mode as owner-funded AI',()=>fixture(async({p,render})=>{
 assert.match(text(render()),/Local AI uses the development server key/);p.tab='analysis';assert.match(text(render()),/Local AI study tools/);assert.doesNotMatch(text(render()),/Owner AI study tools/);
},{mode:'local',status:{configured:true,localOnly:true}}));

test('unavailable access cannot retain an obsolete loading indicator when Send is invoked before cleanup',()=>fixture(async({p,render,send,calls})=>{
 await send();p.clearByokKey();let tree=render(false);
 nodes(tree).find(n=>n.type==='textarea'&&n.props['aria-label']==='Ask about this paper').props.onChange({target:{value:'Review access'}});tree=render(false);
 nodes(tree).find(n=>n.type==='form'&&n.props.className==='chat-compose').props.onSubmit({preventDefault(){}});tree=render();assert.match(text(tree),/AI access is unavailable/);assert.doesNotMatch(text(tree),/Reading the selected context/);assert.equal(calls.length,1);
 calls[0].resolve(response({answer:'OBSOLETE',sources:[source]}));await tick();assert.doesNotMatch(text(render()),/OBSOLETE/);
}));
