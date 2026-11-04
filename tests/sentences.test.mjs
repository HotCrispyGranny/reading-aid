import {test} from 'node:test';import assert from 'node:assert/strict';
import {sentenceRanges,extractPage,joinContinuations} from '../src/lib/sentences.mjs';
const text=t=>sentenceRanges(t).map(r=>t.slice(r.start,r.end));
test('abbreviations, decimals, citations and units do not break sentences',()=>{
 assert.deepEqual(text('Dr. Wu et al. measured 3.5 mL (Fig. 2). [12, 13] The next test used 1.0 m. Each result was stable.'),['Dr. Wu et al. measured 3.5 mL (Fig. 2). [12, 13]','The next test used 1.0 m.','Each result was stable.']);
 assert.deepEqual(text('For example, e.g. the power number is constant. It is dimensionless.'),['For example, e.g. the power number is constant.','It is dimensionless.']);
});
const item=(str,x,y,width=230)=>({str,width,height:11,transform:[11,0,0,11,x,792-y]});
test('two-column page reads all left lines before right lines',()=>{
 const items=[];for(let i=0;i<8;i++){items.push(item(`Left column ${i} contains a complete scientific sentence.`,40,70+i*20));items.push(item(`Right column ${i} contains another complete sentence.`,320,70+i*20))}
 const p=extractPage(items,612,792,1);assert.ok(p.gutter);assert.equal(p.sentences.length,16);assert.ok(p.sentences.slice(0,8).every(s=>s.text.startsWith('Left')));assert.ok(p.sentences.slice(8).every(s=>s.text.startsWith('Right')));
});
test('multiline normalized sentence retains exact per-item runs',()=>{
 const p=extractPage([item('The rotational flow was mea',40,70),item('-',270,70,3),item('sured under steady conditions and compared with a baseline.',40,85)],612,792,1);
 assert.equal(p.sentences.length,1);assert.match(p.sentences[0].text,/measured/);assert.ok(p.sentences[0].runs.some(r=>r.itemIndex===2));assert.equal(p.sentences[0].page,1);
});
test('cross-page continuation has one stable id and both page anchors',()=>{
 const a=extractPage([item('The final observation was obtained after a careful series of measurements',40,70,500)],612,792,2);
 const b=extractPage([item('under controlled conditions in the same laboratory.',40,70,500)],612,792,3);
 const merged=joinContinuations([a,b]);assert.equal(merged.length,1);assert.deepEqual([...new Set(merged[0].runs.map(r=>r.page))],[2,3]);assert.equal(merged[0].id,a.sentences[0].id);
});
test('scan and equation do not fabricate readable sentences',()=>{assert.equal(extractPage([],612,792,1).sentences.length,0);assert.equal(extractPage([item('P = N^3 D^5 rho (1)',40,70)],612,792,1).sentences.length,0)});
