import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractPage,readingLines,joinContinuations,sentenceAtOffset,stepSentence} from '../src/lib/sentences.mjs';

const fixtures=JSON.parse(readFileSync(new URL('./support/scientific-inline-runs.json',import.meta.url)));
function sourceItems(fixture){
 // Preserve the real PDF item indices, including holes for omitted items.
 const items=Array.from({length:Math.max(...fixture.items.map(it=>it.index))+1},()=>({str:'',width:0,height:0,transform:[1,0,0,1,0,0]}));
 for(const {index,...it}of fixture.items)items[index]=it;
 return items;
}
function extract(fixture,items=sourceItems(fixture)){
 return extractPage(items,fixture.width,fixture.height,fixture.page,fixture.transform);
}
function coverage(sources,sentences){
 const counts=new Map(sources.map(({page,items})=>[page,items.map(it=>new Uint16Array(it.str.length))]));
 for(const sentence of sentences)for(const run of sentence.runs){
  const source=sources.find(p=>p.page===run.page)?.items[run.itemIndex];assert.ok(source);
  assert.ok(Number.isInteger(run.start)&&Number.isInteger(run.end)&&run.start>=0&&run.end>run.start&&run.end<=source.str.length);
  for(let offset=run.start;offset<run.end;offset++)counts.get(run.page)[run.itemIndex][offset]++;
 }
 for(const {page,items}of sources)items.forEach((it,itemIndex)=>{
  // Check original UTF-16 code units, including BOTH halves of astral glyphs.
  for(let offset=0;offset<it.str.length;offset++)if(!/\s/u.test(it.str[offset])){
   assert.equal(counts.get(page)[itemIndex][offset],1,`Lost/duplicated source p${page} i${itemIndex} offset ${offset}: ${it.str}`);
   assert.ok(sentenceAtOffset(sentences,page,itemIndex,offset),'Every covered glyph must resolve to one selectable unit');
  }
 });
}
function navigation(sentences,page){
 let current;const seen=[];
 for(let i=0;i<sentences.length;i++){current=stepSentence(sentences,current?.id,page,1);seen.push(current.id)}
 assert.deepEqual(seen,sentences.map(s=>s.id));
 for(let i=sentences.length-2;i>=0;i--){current=stepSentence(sentences,current.id,page,-1);assert.equal(current.id,sentences[i].id)}
}

const expected=[
 ['4000 < ReD < 15 000, the flow stability and the flame length in the merged flow from multiple unconfined reacting jets increase as the number of jets (Nj) is increased.','Nevertheless,'],
 ['almost exclusively for unconfined environments.','These have shown that the flow characteristics depend strongly on the key geometric features of the nozzles as well as their arrangement.16–23','For example, Tanaka17,18 found that, for a transitional/turbulent flow regime (4300 < ReD < 9000), the rate'],
 ['ditions.','Similarly, Boushaki and Sautet28 showed that αj has a significant influence both on the mixing and instantaneous velocity fields of multiple-jets configurations for a separated-jet combustor with αj = 0◦, 10◦, 20◦, 30◦, but they also did not report details of the inflow and boundary conditions for inclined-jets cases.','Furthermore, none of the previous mea-'],
];

fixtures.cases.forEach((fixture,index)=>{
 test(`real source coverage: ${fixture.name}`,()=>{
  const items=sourceItems(fixture),page=extract(fixture,items),layout=readingLines(items,fixture.width,fixture.height,fixture.transform);
  assert.deepEqual(page.sentences.map(s=>s.text),expected[index]);
  for(const {index:itemIndex}of fixture.items)assert.equal(layout.lines.filter(l=>l.items.some(b=>b.index===itemIndex)).length,1);
  coverage([{page:fixture.page,items}],page.sentences);navigation(page.sentences,fixture.page);
  if(index===1){
   const sentence=page.sentences[1];
   assert.deepEqual(sentence.runs.slice(-2),[{page:2,itemIndex:150,start:0,end:5},{page:2,itemIndex:151,start:0,end:5}]);
   assert.equal(sentenceAtOffset(page.sentences,2,154,0),page.sentences[2],'Tanaka citation belongs to the new sentence');
   assert.equal(sentenceAtOffset(page.sentences,2,153,0).runs[0].start,0);
  }
  if(index===2)for(const itemIndex of [140,142,143,145,146,147,148,149,150,151,152,153])assert.equal(sentenceAtOffset(page.sentences,3,itemIndex,0),page.sentences[1]);
 });

 test(`multi-column source coverage and navigation: ${fixture.name}`,()=>{
  const items=sourceItems(fixture),onRight=fixture.items[0].transform[4]>fixture.width/2,x=onRight?44.105:306.122;
  const firstY=Math.min(...fixture.items.map(it=>fixture.height-it.transform[5]));
  for(let row=0;row<4;row++)items.push({str:`Independent opposite column observation ${row} was stable.`,width:244.08,height:9.9626,fontName:'opposite-body',transform:[9.9626,0,0,9.9626,x,fixture.height-firstY-row*11.955]});
  const page=extract(fixture,items);assert.equal(typeof page.gutter,'number');
  const sentences=joinContinuations([page]),actual=sentences.filter(s=>s.runs.some(r=>r.itemIndex<sourceItems(fixture).length));
  assert.deepEqual(actual.map(s=>s.text),expected[index]);
  assert.ok(actual.every(s=>s.col===(onRight?'right':'left')));
  assert.ok(sentences.slice(0,onRight?4:actual.length).every(s=>s.col==='left'));
  coverage([{page:fixture.page,items}],sentences);navigation(sentences,fixture.page);
 });

 test(`prose coverage is independent of inline item packing: ${fixture.name}`,()=>{
  const layout=readingLines(sourceItems(fixture),fixture.width,fixture.height,fixture.transform);
  const items=layout.lines.map(l=>({str:l.text,width:l.right-l.x,height:l.h,fontName:l.items.find(it=>it.h===l.h).font,transform:[l.h,0,0,l.h,l.x,fixture.height-l.y]}));
  const page=extract(fixture,items);assert.deepEqual(page.sentences.map(s=>s.text),expected[index]);
  coverage([{page:fixture.page,items}],page.sentences);
 });
});

const item=(str,x,y,width,size=10,fontName='body')=>({str,width,height:size,fontName,transform:[size,0,0,size,x,792-y]});
test('Unicode superscript citations after arrange-/ment. end the sentence before For example and Tanaka references',()=>{
 const items=[item('The reports describe nozzle arrange-',40,70,230),item('ment.',40,82,25),item('¹⁶–²³',65,78.4,18,7),item('For example, Tanaka',86,82,90),item('¹⁷,¹⁸',176,78.4,18,7),item('found stable results.',198,82,100)];
 const {sentences}=extractPage(items,612,792,1);
 assert.deepEqual(sentences.map(s=>s.text),['The reports describe nozzle arrangement.¹⁶–²³','For example, Tanaka¹⁷,¹⁸ found stable results.']);
 assert.equal(sentenceAtOffset(sentences,1,2,4),sentences[0]);assert.equal(sentenceAtOffset(sentences,1,4,4),sentences[1]);
 assert.equal(sentences[1].runs[0].itemIndex,3);coverage([{page:1,items}],sentences);
});

test('UTF-16 offsets retain Greek/subscript, degree signs, Unicode minus, dashes and surrogate pairs',()=>{
 const str='  The 😀 jet combustor with αⱼ = −0°, 10°, 20°, 30° was stable.  The αⱼ–flow agreed.  ',items=[item(str,40,70,500)];
 const {sentences}=extractPage(items,612,792,1),next=str.indexOf('The αⱼ');
 assert.deepEqual(sentences.map(s=>s.text),['The 😀 jet combustor with αⱼ = −0°, 10°, 20°, 30° was stable.','The αⱼ–flow agreed.']);assert.equal(sentences[1].runs[0].start,next);
 assert.equal(sentenceAtOffset(sentences,1,0,str.indexOf('😀')+1),sentences[0]);
 assert.equal(sentenceAtOffset(sentences,1,0,next),sentences[1]);coverage([{page:1,items}],sentences);
});

test('a numeric first body line remains in a cross-page continuation with exact source coverage',()=>{
 const fixture=fixtures.cases[0],items=sourceItems(fixture),before=[item('For Reynolds numbers within the range',306.122,710,244.08,9.9626,'g_d0_f4')];
 const first=extractPage(before,fixture.width,fixture.height,2,fixture.transform),second=extract(fixture,items),sentences=joinContinuations([first,second]);
 assert.equal(sentences[0].text,first.sentences[0].text+' '+expected[0][0]);
 assert.equal(sentences[0].id,first.sentences[0].id);assert.deepEqual([...new Set(sentences[0].runs.map(r=>r.page))],[2,3]);
 coverage([{page:2,items:before},{page:3,items}],sentences);navigation(sentences,2);
});

test('sparse numeric rows and standalone equations retain their deliberate prose exclusion',()=>{
 // These fixtures intentionally have no sentence coverage: manually selectable
 // table cells/equations must not become invented body prose as a side effect.
 for(const items of [
  [item('Steady swirling',40,70,70),item('12',113,70,10),item('14',126,70,10),item('16',139,70,10)],
  [item('12 14 16',40,70,80)],
  [item('P = N^3 D^5 rho (1)',40,70,150)],
 ])assert.equal(extractPage(items,612,792,1).sentences.length,0);
});
