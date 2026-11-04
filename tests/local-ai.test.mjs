import {test} from 'node:test';import assert from 'node:assert/strict';
import {callAI,localAIAllowed,usageCost} from '../server/ai.mjs';
import {buildBridgePrompt,bridgePresets} from '../src/lib/bridge.mjs';
test('paid AI is local-only, ignores spoofed forwarding, and is disabled in production/Vercel',()=>{
 const old={NODE_ENV:process.env.NODE_ENV,VERCEL:process.env.VERCEL};delete process.env.NODE_ENV;delete process.env.VERCEL;
 const req=(ip,host)=>({socket:{remoteAddress:ip},get:name=>name==='host'?host:undefined});
 try{assert.equal(localAIAllowed(req('127.0.0.1','localhost:4173')),true);assert.equal(localAIAllowed(req('10.0.0.2','localhost:4173')),false);assert.equal(localAIAllowed(req('127.0.0.1','evil.example')),false);process.env.VERCEL='1';assert.equal(localAIAllowed(req('127.0.0.1','localhost')),false);delete process.env.VERCEL;process.env.NODE_ENV='production';assert.equal(localAIAllowed(req('127.0.0.1','localhost')),false)}finally{for(const[k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});
test('official Responses API uses GPT-5 mini, bounded history/context, usage and cache without retries',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.AI_API_KEY,oldModel=process.env.AI_MODEL;process.env.AI_API_KEY='test-only-not-a-real-key';process.env.AI_MODEL='gpt-5-mini';let calls=0,payload;
 try{
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),'https://api.openai.com/v1/responses');payload=JSON.parse(init.body);return new Response(JSON.stringify({object:'response',id:'resp_test',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({answer:'【文献事实】温度为25°C。[S1]',citations:['S1','S999']})}]}],usage:{input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:100},output_tokens_details:{reasoning_tokens:50}}}),{headers:{'Content-Type':'application/json'}})};
  const args={task:'chat',sources:[{id:'S1',page:3,text:'The temperature was 25 °C.'}],question:'Explain it',history:Array.from({length:20},()=>({role:'user',content:'long'.repeat(1000)})),document:{title:'Real paper',page:3},signal:new AbortController().signal};
  const r=await callAI(args);assert.match(r.answer,/文献事实/);assert.equal(r.sources.length,1);assert.equal(r.sources[0].page,3);assert.equal(payload.model,'gpt-5-mini');assert.equal(payload.temperature,undefined);assert.equal(payload.max_tokens,undefined);assert.equal(payload.reasoning.effort,'low');assert.equal(payload.store,false);const body=JSON.parse(payload.input[1].content);assert.equal(body.document.title,'Real paper');assert.equal(body.history.length,4);assert.equal(body.history[0].content.length,1500);assert.equal(r.usage.inputTokens,1000);assert.ok(r.usage.estimatedCostUSD>0);
  const cached=await callAI(args);assert.equal(calls,1);assert.equal(cached.usage.cacheHit,true);assert.equal(cached.usage.chargedThisCallUSD,0);
  await callAI({...args,question:'A follow-up question',history:[{role:'assistant',content:r.answer}]});assert.equal(calls,2);assert.equal(JSON.parse(payload.input[1].content).history[0].content,r.answer);
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'invalid model'}}),{status:400,headers:{'Content-Type':'application/json'}});await assert.rejects(()=>callAI({...args,question:'Uncached error test'}),/rejected the model/);
 }finally{globalThis.fetch=oldFetch;for(const[k,v]of Object.entries({AI_API_KEY:oldKey,AI_MODEL:oldModel})){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});
test('cost calculation includes cached input and all billed output, including reasoning',()=>{assert.equal(usageCost({input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:100}},{input:.25,cachedInput:.025,output:2}),.0006275);assert.equal(usageCost({},{input:null,cachedInput:null,output:null}),null)});
test('bridge preserves exact sentence, accurate page and ordered neighbours; never invents missing context',()=>{
 const sentences=Array.from({length:7},(_,i)=>({id:String(i),text:`Sentence ${i}.`,page:i+1}));const current={...sentences[3],context:'Paragraph from extraction.'};
 const prompts=bridgePresets.map(p=>buildBridgePrompt({current,sentences,preset:p.id,fileName:'paper.pdf',complete:true}));assert.equal(new Set(prompts).size,5);assert.match(prompts[0],/Page: 4/);assert.match(prompts[0],/Section: Unavailable/);assert.ok(prompts[0].indexOf('Sentence 1.')<prompts[0].indexOf('Sentence 2.'));assert.ok(prompts[0].indexOf('Sentence 4.')<prompts[0].indexOf('Sentence 5.'));assert.ok(!prompts[0].includes('Sentence 0.'));assert.ok(!prompts[0].includes('Sentence 6.'));
 const minimal=buildBridgePrompt({current,sentences,includeContext:false,customQuestion:'My own question'});assert.match(minimal,/My own question/);assert.ok(!minimal.includes('Paragraph from extraction'));assert.equal(buildBridgePrompt({}), '');
});
