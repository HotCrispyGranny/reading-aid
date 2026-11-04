import {test} from 'node:test';import assert from 'node:assert/strict';
import {sentenceRanges,extractPage,joinContinuations,stepSentence} from '../src/lib/sentences.mjs';
const text=t=>sentenceRanges(t).map(r=>t.slice(r.start,r.end));
test('abbreviations, decimals, citations and units do not break sentences',()=>{
 assert.deepEqual(text('Dr. Wu et al. measured 3.5 mL (Fig. 2). [12, 13] The next test used 1.0 m. Each result was stable.'),['Dr. Wu et al. measured 3.5 mL (Fig. 2). [12, 13]','The next test used 1.0 m.','Each result was stable.']);
 assert.deepEqual(text('For example, e.g. the power number is constant. It is dimensionless.'),['For example, e.g. the power number is constant.','It is dimensionless.']);
 assert.deepEqual(text('The temperature was 298 K. It was stable.'),['The temperature was 298 K.','It was stable.']);
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

test('wrapped sentences survive many runs, hanging indents and short final sentences',()=>{
 const p=extractPage([
  item('The samples were collected',40,70,200),
  item('under carefully controlled',60,85,190),
  item('conditions and compared',40,100,180),
  item('with the baseline. It worked.',40,115,210),
 ],612,792,1);
 assert.deepEqual(p.sentences.map(s=>s.text),['The samples were collected under carefully controlled conditions and compared with the baseline.','It worked.']);
 assert.deepEqual(p.sentences[0].runs.map(r=>r.itemIndex),[0,1,2,3]);
 assert.equal(p.sentences[1].runs[0].start,19);
});

test('line-break hyphens normalize words while retaining every printed source character',()=>{
 for(const separate of [false,true]){
  const items=separate?[item('The value was ap',40,70,150),item('-',190,70,3)]:[item('The value was ap-',40,70,153)];
  items.push(item('proximately constant. It worked.',40,85,230));
  const p=extractPage(items,612,792,1);
  assert.deepEqual(p.sentences.map(s=>s.text),['The value was approximately constant.','It worked.']);
  assert.equal(p.sentences[0].runs.map(r=>items[r.itemIndex].str.slice(r.start,r.end)).join(''),'The value was ap-proximately constant.');
  assert.equal(p.sentences[1].runs[0].start,22);
 }
});

test('soft hyphens normalize at line breaks and scientific compound hyphens remain',()=>{
 for(const [left,right,word] of [['ap\u00ad','proximately','approximately'],['laboratory-','scale','laboratory-scale'],['well-','known','well-known']]){
  const p=extractPage([item('The '+left,40,70),item(right+' measurement was stable.',40,85)],612,792,1);
  assert.equal(p.sentences[0].text,`The ${word} measurement was stable.`);
  assert.equal(p.sentences[0].runs[0].end,('The '+left).length);
 }
 const inline=extractPage([item('A laboratory-scale test was stable.',40,70)],612,792,1);
 assert.equal(inline.sentences[0].text,'A laboratory-scale test was stable.');
});

test('normalized whitespace preserves original UTF-16 source offsets',()=>{
 const str='  First    sentence.  Next sentence.  ';
 const p=extractPage([item(str,40,70)],612,792,1);
 assert.deepEqual(p.sentences.map(s=>s.text),['First sentence.','Next sentence.']);
 assert.deepEqual(p.sentences.map(s=>s.runs.map(r=>str.slice(r.start,r.end)).join('')),['First    sentence.','Next sentence.']);
});

test('section prefixes are not standalone sentences and wrapped headings form one unit',()=>{
 assert.deepEqual(text('6.1. Suspension bed height measurements'),['6.1. Suspension bed height measurements']);
 const p=extractPage([
  item('6. Experimental results',40,70,180),
  item('6.1. Suspension bed height measurements in laboratory-scale',40,100,490),
  item('precipitators',40,115,90),
  item('It worked.',40,145,70),
 ],612,792,1);
 assert.deepEqual(p.sentences.map(s=>[s.kind,s.text]),[
  ['heading','6. Experimental results'],
  ['heading','6.1. Suspension bed height measurements in laboratory-scale precipitators'],
  ['body','It worked.'],
 ]);
 assert.deepEqual(p.sentences[1].runs.map(r=>r.itemIndex),[1,2]);
 assert.ok(p.sentences.slice(0,2).every(s=>s.complete));
});

test('a separately positioned section number stays attached to its heading',()=>{
 const p=extractPage([item('6.1.',40,70,20),item('Suspension measurements',82,70,180),item('It worked.',40,100,70)],612,792,1);
 assert.deepEqual(p.sentences.map(s=>s.text),['6.1. Suspension measurements','It worked.']);
 assert.deepEqual(p.sentences[0].runs.map(r=>r.itemIndex),[0,1]);
 assert.equal(extractPage([item('6.',40,70,20)],612,792,1).sentences.length,0);
});

test('figure captions remain selectable and isolated from surrounding body text',()=>{
 const p=extractPage([
  item('The sample was measured',40,70,180),
  item('Fig. 12. Measured suspension height under controlled',40,100,490),
  item('laboratory conditions.',40,115,150),
  item('The next paragraph describes the result.',40,145,280),
 ],612,792,1);
 assert.deepEqual(p.sentences.map(s=>[s.kind,s.text]),[
  ['body','The sample was measured'],
  ['caption','Fig. 12. Measured suspension height under controlled laboratory conditions.'],
  ['body','The next paragraph describes the result.'],
 ]);
 assert.deepEqual(p.sentences[1].runs.map(r=>r.itemIndex),[1,2]);
 const references=extractPage([item('Fig. 12 shows the measured suspension height.',40,70)],612,792,1);
 assert.equal(references.sentences[0].kind,'body');
 const caption=extractPage([item('Fig. 12 Measured suspension height.',40,70)],612,792,1);
 assert.equal(caption.sentences[0].kind,'caption');
});

test('two-column reading order also works when every word is a separate PDF item',()=>{
 const items=[];
 for(let row=0;row<4;row++)for(const [x,label] of [[40,'Left'],[320,'Right']]){
  let cursor=x;
  for(const word of `${label} column row ${row} is measured.`.split(' ')){
   const width=word.length*5;items.push(item(word,cursor,70+row*15,width));cursor+=width+3;
  }
 }
 const p=extractPage(items,612,792,1);
 assert.ok(p.gutter);
 assert.deepEqual(p.sentences.map(s=>s.text),[...Array.from({length:4},(_,i)=>`Left column row ${i} is measured.`),...Array.from({length:4},(_,i)=>`Right column row ${i} is measured.`)]);
});

test('short uppercase page continuations retain both page anchors and stable ids',()=>{
 const a=extractPage([item('We compared',40,70)],612,792,1);
 const b=extractPage([item('NASA data. It worked.',40,70)],612,792,2);
 const before=JSON.stringify([a,b]);const merged=joinContinuations([a,b]);
 assert.deepEqual(merged.map(s=>s.text),['We compared NASA data.','It worked.']);
 assert.equal(merged[0].id,a.sentences[0].id);
 assert.deepEqual(merged[0].runs.map(r=>r.page),[1,2]);
 assert.equal(JSON.stringify([a,b]),before);
 assert.deepEqual(joinContinuations([a,b]),merged);
});

test('hyphenated continuations can span three pages without losing physical runs',()=>{
 const pages=['The value was ap-','proximately constant and','remained stable.'].map((str,i)=>extractPage([item(str,40,70)],612,792,i+1));
 const merged=joinContinuations(pages);
 assert.equal(merged.length,1);assert.equal(merged[0].text,'The value was approximately constant and remained stable.');
 assert.deepEqual(merged[0].runs.map(r=>r.page),[1,2,3]);
 assert.equal(merged[0].runs[0].end,'The value was ap-'.length);
});

test('continuations do not merge across headings, captions or pages without text',()=>{
 const a=extractPage([item('The last observation was measured without a final value',40,70)],612,792,1);
 const heading=extractPage([item('6.1. Results',40,70,100),item('under controlled conditions in the laboratory.',40,100)],612,792,2);
 assert.equal(joinContinuations([a,heading]).length,3);
 const caption=extractPage([item('Fig. 12. Measured results.',40,70)],612,792,2);
 assert.equal(joinContinuations([a,caption]).length,2);
 const later=extractPage([item('under controlled conditions in the laboratory.',40,70)],612,792,3);
 assert.equal(joinContinuations([a,extractPage([],612,792,2),later]).length,2);
});

test('scientific abbreviations and adjacent numbered citations retain sentence boundaries',()=>{
 assert.deepEqual(text('See Eq. (6) and Figs. 2–3 for 3.5 mg/L. [1] [2, 4] The result at 25 °C was stable.'),[
  'See Eq. (6) and Figs. 2–3 for 3.5 mg/L. [1] [2, 4]',
  'The result at 25 °C was stable.',
 ]);
});

test('prose containing inline equations is indexed without fabricating standalone equations',()=>{
 const p=extractPage([
  item('The particles remained',40,70,180),
  item('suspended at H = 0. This can be achieved if the',40,85,330),
  item('agitator is sufficiently fast.',40,100,200),
 ],612,792,1);
 assert.deepEqual(p.sentences.map(s=>s.text),['The particles remained suspended at H = 0.','This can be achieved if the agitator is sufficiently fast.']);
 assert.equal(extractPage([item('P = N^3 D^5 rho (1)',40,70)],612,792,1).sentences.length,0);
});

test('superscript citations attach to the correct column with staggered baselines',()=>{
 const items=[];
 for(let row=0;row<4;row++){
  items.push(item(`Left column sentence ${row} is measured.`,40,80+row*15,230));
  items.push(item(`Right column sentence ${row} is measured.`,320,89+row*15,200));
  const citation=item('12',520,83+row*15,7);citation.height=7;citation.transform=[7,0,0,7,520,792-(83+row*15)];items.push(citation);
 }
 const p=extractPage(items,612,792,1);
 assert.equal(p.sentences.length,8);
 assert.ok(p.sentences.slice(0,4).every(s=>s.text.startsWith('Left')));
 assert.ok(p.sentences.slice(4).every(s=>/measured\.12$/.test(s.text)));
 assert.ok(p.sentences.slice(4).every(s=>s.runs.length===2));
 assert.deepEqual(text('The rate decays.20 Furthermore, it is stable.43–45 The next result agrees.'),['The rate decays.20','Furthermore, it is stable.43–45','The next result agrees.']);
});

test('page joins respect indentation and font changes instead of swallowing unrelated text',()=>{
 const a=extractPage([item('The last value was obtained with',40,70)],612,792,1);
 const b=extractPage([item('New paragraph starts here.',60,70),item('The body text follows.',40,100)],612,792,2);
 assert.equal(joinContinuations([a,b]).length,3);
 const other=item('Different font starts here.',40,70);other.fontName='other';
 assert.equal(joinContinuations([a,extractPage([other],612,792,2)]).length,2);
});

test('large wrapped headings remain one unit and Roman-numbered table captions are isolated',()=>{
 const heading=(str,y,w)=>{const b=item(str,40,y,w);b.height=15;b.transform=[15,0,0,15,40,792-y];return b};
 const p=extractPage([
  heading('Measurements of suspension height in a laboratory',70,490),
  heading('precipitator',88,100),
  item('The experiment worked.',40,120,170),
  item('TABLE IV. Definition of the flow regimes.',40,150,280),
  item('The next paragraph starts here.',40,180,220),
 ],612,792,1);
 assert.deepEqual(p.sentences.map(s=>s.kind),['heading','body','caption','body']);
 assert.equal(p.sentences[0].text,'Measurements of suspension height in a laboratory precipitator');
 assert.equal(p.sentences[2].text,'TABLE IV. Definition of the flow regimes.');
});

test('navigation visits every logical heading, sentence and caption in both directions',()=>{
 const a=extractPage([
  item('6.1. Results',40,70,90),
  item('The first observation was',40,100,170),item('stable. It worked.',40,115,120),
  item('Fig. 12. Measured results.',40,145,180),
  item('We compared',40,180,90),
 ],612,792,1);
 const b=extractPage([item('NASA data.',40,70,80),item('6.2. Discussion',40,100,120),item('The results agree.',40,130,140)],612,792,2);
 const sentences=joinContinuations([a,b]);
 assert.deepEqual(sentences.map(s=>s.text),['6.1. Results','The first observation was stable.','It worked.','Fig. 12. Measured results.','We compared NASA data.','6.2. Discussion','The results agree.']);
 let current;const forward=[];
 for(let i=0;i<sentences.length;i++){current=stepSentence(sentences,current?.id,1,1);forward.push(current.id)}
 assert.deepEqual(forward,sentences.map(s=>s.id));
 assert.equal(new Set(forward).size,sentences.length);
 assert.equal(stepSentence(sentences,current.id,2,1).id,current.id);
 const backward=[current.id];for(let i=1;i<sentences.length;i++){current=stepSentence(sentences,current.id,2,-1);backward.push(current.id)}
 assert.deepEqual(backward,[...forward].reverse());
 assert.equal(stepSentence(sentences,current.id,1,-1).id,current.id);
 assert.equal(stepSentence(sentences,undefined,2,1).text,'We compared NASA data.');
 assert.equal(stepSentence(sentences,undefined,3,1).id,sentences.at(-1).id);
 assert.equal(stepSentence([],undefined,1,1),undefined);
});

test('an unfinished sentence continues from the left column to the right without skipping units',()=>{
 const items=[];
 for(let row=0;row<3;row++){
  items.push(item(`Left column measurement ${row} was stable.`,40,70+row*15,230));
  items.push(item(row===0?'under controlled conditions. It worked.':`Right column measurement ${row} was stable.`,320,70+row*15,230));
 }
 items.push(item('The final observation was obtained',40,115,220));
 const sentences=joinContinuations([extractPage(items,612,792,1)]);
 assert.equal(sentences.length,7);
 assert.equal(sentences[3].text,'The final observation was obtained under controlled conditions.');
 assert.deepEqual(sentences[3].runs.map(r=>r.itemIndex),[6,1]);
 assert.equal(stepSentence(sentences,sentences[3].id,1,1).text,'It worked.');
 assert.equal(stepSentence(sentences,sentences[4].id,1,-1).id,sentences[3].id);
});
