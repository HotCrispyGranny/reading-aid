import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {RedisByokStore,BYOK_READY,BYOK_RESERVE,BYOK_FINISH} from '../server/byok-store.mjs';
import {BUDGET_KEY} from '../server/beta-store.mjs';

async function execute(ops,t){
 const result=await new Promise((resolve,reject)=>{
  const child=spawn('python',[fileURLToPath(new URL('./lua-ledger.py',import.meta.url))],{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('embedded Lua test timed out'))},10000);
  child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  child.on('error',error=>{clearTimeout(timer);if(error.code==='ENOENT'){t.skip('Optional Python/liblua interpreter unavailable');resolve(null)}else reject(error)});
  child.on('close',status=>{clearTimeout(timer);resolve({status,stdout,stderr})});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(ops));
 });
 if(!result)return null;assert.equal(result.status,0,result.stderr);const data=JSON.parse(result.stdout);
 if(data.unavailable){t.skip('Optional liblua interpreter unavailable');return null}return data.results;
}
const store=new RedisByokStore({}),keys=(client,ip,id,now)=>store.byokKeys(client,ip,id,now);
const reserve=(client,ip,id,now=60000)=>({script:BYOK_RESERVE,keys:keys(client,ip,id,now),args:[now]});
const finish=(client,ip,id,now=60000)=>({script:BYOK_FINISH,keys:keys(client,ip,id,now)});

test('actual BYOK scripts work without any owner budget and never create it',async t=>{
 const result=await execute([{script:BYOK_READY},reserve('client','ip','one'),finish('client','ip','one'),{script:"return redis.call('EXISTS',KEYS[1])",keys:[BUDGET_KEY]}],t);
 if(result)assert.deepEqual(result,['OK','OK','OK','0']);
});
test('BYOK client concurrency, global concurrency and replay protection are atomic',async t=>{
 const result=await execute([reserve('a','ip1','one'),reserve('a','ip1','two'),reserve('b','ip2','one'),reserve('c','ip3','one'),reserve('d','ip4','one'),finish('a','ip1','one'),reserve('d','ip4','one'),reserve('a','ip1','one')],t);
 if(result)assert.deepEqual(result,['OK','RATE_LIMITED','OK','OK','RATE_LIMITED','OK','OK','DUPLICATE_REQUEST']);
});
test('BYOK rate limits a single client and resists cookie resets using an IP bucket',async t=>{
 const ops=[];for(let i=0;i<5;i++)ops.push(reserve('a','ip',String(i)),finish('a','ip',String(i)));
 ops.push(reserve('a','ip','six'));
 for(let i=0;i<5;i++)ops.push(reserve('new'+i,'ip','one'),finish('new'+i,'ip','one'));
 ops.push(reserve('reset-again','ip','last'));
 const result=await execute(ops,t);if(result){assert.ok(result.slice(0,10).every(s=>s==='OK'));assert.equal(result[10],'RATE_LIMITED');assert.ok(result.slice(11,-1).every(s=>s==='OK'));assert.equal(result.at(-1),'RATE_LIMITED')}
});
test('BYOK global limit spans anonymous clients and IPs without owner accounting',async t=>{
 const ops=[];for(let i=0;i<20;i++)ops.push(reserve('client'+i,'ip'+i,'one'),finish('client'+i,'ip'+i,'one'));
 ops.push(reserve('new','new-ip','last'));
 const result=await execute(ops,t);if(result){assert.ok(result.slice(0,-1).every(s=>s==='OK'));assert.equal(result.at(-1),'RATE_LIMITED')}
});
test('BYOK traffic leaves existing owner balances byte-for-byte unchanged',async t=>{
 const result=await execute([{script:"redis.call('HSET',KEYS[1],'spent','123','reserved','456','limit','5000'); return 'OK'",keys:[BUDGET_KEY]},reserve('a','ip','one'),finish('a','ip','one'),{script:"return redis.call('HGET',KEYS[1],'spent')..','..redis.call('HGET',KEYS[1],'reserved')..','..redis.call('HGET',KEYS[1],'limit')",keys:[BUDGET_KEY]}],t);
 if(result)assert.deepEqual(result,['OK','OK','OK','123,456,5000']);
});
