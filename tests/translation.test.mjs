import {test} from 'node:test';import assert from 'node:assert/strict';
import {translationChunks,translateText} from '../server/translation.mjs';
test('translation chunks respect provider byte limits without truncation',()=>{const text=('The sample was maintained at 25 °C with a concentration of 3.5 g/L. ').repeat(20);const parts=translationChunks(text);assert.ok(parts.length>1);assert.ok(parts.every(s=>Buffer.byteLength(s)<=480));assert.equal(parts.join(' ').replace(/\s+/g,' ').trim(),text.replace(/\s+/g,' ').trim());assert.throws(()=>translationChunks('x'.repeat(501)))});
test('keyless translation calls real provider protocol; no invented fallback on quota/network failure',async()=>{
 const original=globalThis.fetch;try{
  globalThis.fetch=async url=>{assert.equal(url.hostname,'api.mymemory.translated.net');assert.equal(url.searchParams.get('langpair'),'en|zh-CN');assert.equal(url.searchParams.get('q'),'The temperature was 25 °C.');return new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'温度为 25 °C。'}}),{status:200})};
  const result=await translateText('The temperature was 25 °C.',new AbortController().signal);assert.equal(result.translation,'温度为 25 °C。');assert.equal(result.provider,'MyMemory');
  globalThis.fetch=async()=>new Response(JSON.stringify({responseStatus:429,quotaFinished:true}),{status:200});await assert.rejects(()=>translateText('test',new AbortController().signal),/quota/);
  globalThis.fetch=async()=>{throw Error('network')};await assert.rejects(()=>translateText('test',new AbortController().signal),/could not be reached/);
 }finally{globalThis.fetch=original}
});
