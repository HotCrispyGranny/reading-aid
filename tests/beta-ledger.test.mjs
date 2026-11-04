import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {READY,ATTEMPT,RESERVE,FINISH,RedisBetaStore,BUDGET_KEY,INVITES_KEY,PREFIX} from '../server/beta-store.mjs';

async function execute(ops,t){
 const result=await new Promise((resolve,reject)=>{
  const child=spawn('python',[fileURLToPath(new URL('./lua-ledger.py',import.meta.url))],{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('embedded Lua test timed out'))},10000);
  child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  child.on('error',error=>{clearTimeout(timer);if(error.code==='ENOENT'){t.skip('Optional Python/liblua interpreter is unavailable');resolve(null)}else reject(error)});
  child.on('close',status=>{clearTimeout(timer);resolve({status,stdout,stderr})});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(ops));
 });
 if(!result)return null;
 assert.equal(result.status,0,result.stderr);const data=JSON.parse(result.stdout);
 if(data.unavailable){t.skip('Optional liblua interpreter is unavailable');return null}return data.results;
}
const init={script:"redis.call('HSET',KEYS[1],'limit','5000','spent','0','reserved','0'); return 'OK'",keys:[BUDGET_KEY]};
const keys=(id,request,now)=>new RedisBetaStore({}).reservationKeys(id,request,now);
const reserve=(id,request,amount=100,now=60000,cap=5000)=>({script:"redis.call('HSET',KEYS[7],ARGV[4],ARGV[5]); "+RESERVE,keys:keys(id,request,now),args:[amount,cap,now,id,'test-invite-hash']});
const finish=(id,request,actual=10,now=60000)=>{const k=keys(id,request,now);return {script:FINISH,keys:[k[0],k[3],k[4],k[5]],args:actual===null?['unknown',0,0,0,0]:['settled',actual,100,10,0]}};
const balance={script:"return redis.call('HGET',KEYS[1],'spent')..','..redis.call('HGET',KEYS[1],'reserved')",keys:[BUDGET_KEY]};

test('actual reservation Lua requires initialization and conserves budget across settlement/unknown outcomes',async t=>{
 const results=await execute([{script:READY,keys:[BUDGET_KEY]},reserve('a','missing'),init,reserve('a','one',1000),balance,finish('a','one',200),balance,finish('a','one',200),balance,reserve('a','two',4000),finish('a','two',null),balance,reserve('b','three',801),reserve('b','three',800),balance],t);
 if(results)assert.deepEqual(results,['AI_UNAVAILABLE','AI_UNAVAILABLE','OK','OK','0,1000','OK','200,0','OK','200,0','OK','OK','200,4000','BUDGET_EXHAUSTED','OK','200,4800']);
});

test('actual Lua enforces per-invite/global concurrency and never refunds expired leases',async t=>{
 const result=await execute([init,reserve('a','one'),reserve('a','two'),reserve('b','one'),reserve('c','one'),reserve('d','one'),reserve('d','new',100,180001),balance],t);
 if(result)assert.deepEqual(result,['OK','OK','RATE_LIMITED','OK','OK','RATE_LIMITED','OK','0,400']);
});

test('actual Lua enforces per-invite rate limits, persistent replay rejection and window reset',async t=>{
 const ops=[init];for(let i=0;i<5;i++)ops.push(reserve('a',String(i)),finish('a',String(i),0));
 ops.push(reserve('a','six'),reserve('a','0'),reserve('a','next',100,120001));
 const result=await execute(ops,t);if(result){assert.ok(result.slice(0,11).every(r=>r==='OK'));assert.deepEqual(result.slice(11),['RATE_LIMITED','DUPLICATE_REQUEST','OK'])}
});

test('actual Lua enforces a global request limit across invite identities',async t=>{
 const ops=[init];for(let i=0;i<20;i++)ops.push(reserve('friend'+i,'one'),finish('friend'+i,'one',0));
 ops.push(reserve('new','last'));const result=await execute(ops,t);if(result){assert.ok(result.slice(0,-1).every(r=>r==='OK'));assert.equal(result.at(-1),'RATE_LIMITED')}
});

test('actual Lua rate limits invite attempts globally and per address',async t=>{
 const attempt=ip=>({script:ATTEMPT,keys:[BUDGET_KEY,PREFIX+'login:'+ip,PREFIX+'login:all']});
 const ops=[init,...Array.from({length:5},()=>attempt('a')),attempt('a')];
 for(let i=0;i<25;i++)ops.push(attempt('other'+i));ops.push(attempt('last'));
 const result=await execute(ops,t);if(result){assert.equal(result[6],'RATE_LIMITED');assert.ok(result.slice(7,-1).every(r=>r==='OK'));assert.equal(result.at(-1),'RATE_LIMITED')}
});

test('durable ceiling overrides deployment configuration; accounting overruns suspend paid AI',async t=>{
 const result=await execute([init,reserve('a','large',5001,60000,9000),reserve('a','one',100),finish('a','one',101),{script:READY,keys:[BUDGET_KEY]},reserve('b','two')],t);
 if(result)assert.deepEqual(result,['OK','BUDGET_EXHAUSTED','OK','OK','AI_UNAVAILABLE','AI_UNAVAILABLE']);
});

test('actual Lua rejects an invite revoked from durable state, even with an old valid session',async t=>{
 const k=keys('a','one',60000);
 const result=await execute([init,{script:RESERVE,keys:k,args:[100,5000,60000,'a','old-hash']},{script:"redis.call('HSET',KEYS[1],'a','new-hash'); return 'OK'",keys:[INVITES_KEY]},{script:RESERVE,keys:k,args:[100,5000,60000,'a','old-hash']},{script:RESERVE,keys:k,args:[100,5000,60000,'a','new-hash']}],t);
 if(result)assert.deepEqual(result,['OK','SESSION_INVALID','OK','SESSION_INVALID','OK']);
});

test('member named all cannot collide with global limiter or concurrency keys',async t=>{
 const ops=[init];for(let i=0;i<5;i++)ops.push(reserve('all',String(i)),finish('all',String(i),0));
 ops.push(reserve('all','six'));const result=await execute(ops,t);
 if(result){assert.ok(result.slice(0,11).every(r=>r==='OK'));assert.equal(result.at(-1),'RATE_LIMITED')}
});
