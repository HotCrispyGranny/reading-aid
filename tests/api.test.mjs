import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import app from '../api/index.mjs';
// Exercise the exact exported Vercel handler over real HTTP. Only MyMemory is mocked.
function request(server,path,body,headers={}){
 return new Promise((resolve,reject)=>{const payload=typeof body==='string'?body:JSON.stringify(body);const req=http.request({host:'127.0.0.1',port:server.address().port,path,method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}),...headers}},res=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(data)}))});req.on('error',reject);req.end(body===undefined?undefined:payload)});
}
test('Vercel handler preserves translation, word translation, errors and all API routes',async()=>{
 const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async url=>{calls++;assert.equal(url.hostname,'api.mymemory.translated.net');assert.equal(url.searchParams.get('langpair'),'en|zh-CN');return new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'温度为 25 °C。'}}))};
  let r=await request(server,'/api/translate',{text:'The temperature was 25 °C.'});assert.equal(r.status,200);assert.equal(r.body.translation,'温度为 25 °C。');assert.equal(r.body.provider,'MyMemory');
  r=await request(server,'/api/translate',{text:'The temperature was 25 °C.'});assert.equal(r.status,200);assert.equal(calls,1,'successful sentence cache reused');
  r=await request(server,'/api/translate',{text:'impeller'});assert.equal(r.status,200);assert.equal(calls,2,'word-level path preserved');
  for(const text of ['', ' ', 'x'.repeat(4001),42])assert.equal((await request(server,'/api/translate',{text})).status,400);
  assert.equal((await request(server,'/api/translate','{broken')).status,400);
  assert.equal((await request(server,'/api/status')).status,200);
  assert.ok(Array.isArray((await request(server,'/api/library')).body));
  assert.equal((await request(server,'/api/library/missing')).status,404);
  assert.equal((await request(server,'/api/missing')).status,404);
  assert.equal((await request(server,'/api/translate',{text:'test'},{Origin:'https://wrong.example'})).status,403);
  globalThis.fetch=async()=>{throw Error('offline')};r=await request(server,'/api/translate',{text:'A new uncached sentence.'});assert.equal(r.status,502);assert.match(r.body.error,/could not be reached/);assert.equal(r.body.translation,undefined);
  globalThis.fetch=async()=>new Response(JSON.stringify({responseStatus:429,quotaFinished:true}));r=await request(server,'/api/translate',{text:'Another uncached sentence.'});assert.equal(r.status,502);assert.match(r.body.error,/quota/);
  const oldKey=process.env.AI_API_KEY;delete process.env.AI_API_KEY;
  try{for(const task of ['chat','word','analyze'])assert.equal((await request(server,'/api/'+task,{sources:[]})).status,503)}finally{if(oldKey!==undefined)process.env.AI_API_KEY=oldKey}
 }finally{globalThis.fetch=original;await new Promise(r=>server.close(r))}
});
test('Vercel routing keeps API before SPA fallback, with adequate translation duration',async()=>{
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url)));assert.equal(config.framework,'vite');assert.equal(config.outputDirectory,'dist');assert.equal(config.rewrites[0].source,'/api/:path*');assert.equal(config.rewrites[0].destination,'/api/index');assert.ok(config.functions['api/index.mjs'].maxDuration>60);
 const entry=await readFile(new URL('../api/index.mjs',import.meta.url),'utf8');assert.match(entry,/export \{default\} from/);
});
