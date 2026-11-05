import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractPage,readingLines,sentenceAtOffset,stepSentence} from '../src/lib/sentences.mjs';
import {itemRect,itemOffset} from '../src/lib/highlight-geometry.mjs';

const fixtures=JSON.parse(readFileSync(new URL('./support/numeric-prose-runs.json',import.meta.url)));
const item=(str,x,y,width=230,size=10,fontName='body')=>({str,width,height:size,fontName,transform:[size,0,0,size,x,792-y]});
function sources(fixture){
 const items=Array.from({length:Math.max(...fixture.items.map(it=>it.index))+1},()=>item('',0,0,0));
 for(const {index,geometry,...it}of fixture.items)items[index]=it;
 return items;
}
function assertCoverage(items,sentences,page,intended=new Set(items.map((_,i)=>i)),geometry=[]){
 const count=items.map(it=>new Uint16Array(it.str.length));
 for(const s of sentences)for(const r of s.runs){
  assert.equal(r.page,page);assert.ok(Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end<=items[r.itemIndex].str.length&&r.start<r.end);
  for(let o=r.start;o<r.end;o++)count[r.itemIndex][o]++;
 }
 items.forEach((it,i)=>{for(let o=0;o<it.str.length;o++)if(!/\s/u.test(it.str[o])){
  assert.equal(count[i][o],intended.has(i)?1:0,`p${page} item ${i} offset ${o}: ${it.str}`);
  if(!intended.has(i))continue;
  const owner=sentenceAtOffset(sentences,page,i,o);assert.ok(owner);
  if(geometry[i]){
   // Actual nonuniform PDF operator advances are part of the source fixture.
   // Geometry never depends on the normalized sentence or its string length.
   const g=geometry[i],rect=itemRect(g,o,o+1,page);assert.ok(rect.w>0&&rect.h>0);
   assert.equal(rect.x,g.x+g.advances[o]);assert.equal(rect.y,g.y);
   const hit=itemOffset(g,rect.x+rect.w/2,rect.y+rect.h/2);assert.equal(hit,o);
   assert.equal(sentenceAtOffset(sentences,page,i,hit),owner);
  }
 }});
 let current;for(let i=0;i<sentences.length;i++){current=stepSentence(sentences,current?.id,page,1);assert.equal(current.id,sentences[i].id)}
 for(let i=sentences.length-2;i>=0;i--){current=stepSentence(sentences,current.id,page,-1);assert.equal(current.id,sentences[i].id)}
}

test('real dimensional prose retains dimen-/sions, multiplication signs and native source rectangles',()=>{
 const c=fixtures.cases[0],items=sources(c),page=extractPage(items,c.width,c.height,c.page,c.transform),geometry=[];
 for(const it of c.items)geometry[it.index]=it.geometry;
 assert.deepEqual(page.sentences.map(s=>s.text),[
  'To limit optical distortion, the entire experimental model was fully submerged into a rectangular water tank with dimensions of 500 mm (L) × 400 mm (W) × 390 mm (H).',
  'This water tank was also made from acrylic.','The water from the',
 ]);
 assertCoverage(items,page.sentences,c.page,new Set(c.bodyIndices),geometry);
 assert.equal(sentenceAtOffset(page.sentences,c.page,158,60),page.sentences[0],'Printed line-break hyphen remains mapped');
 assert.equal(sentenceAtOffset(page.sentences,c.page,174,3),page.sentences[1],'This starts the next sentence');
});

test('real repeated parameters retain all Greek, subscript, degree, identifier and source glyphs beside a table',()=>{
 const c=fixtures.cases[1],items=sources(c),page=extractPage(items,c.width,c.height,c.page,c.transform),geometry=[];
 for(const it of c.items)geometry[it.index]=it.geometry;
 const right=page.sentences.filter(s=>s.runs.some(r=>r.itemIndex>=145));
 assert.deepEqual(right.map(s=>s.text),[
  'Figure 5 presents four sets of three typical instantaneous images of velocity vectors, showing direction (black) and magnitude (colored) for the cases in which αj = 25◦ and Nj = 2 (MIJCC 25 2J), αj = 50◦ and Nj = 2 (MIJCC 50 2J), αj = 25◦ and Nj = 4 (MIJCC 25 4J), and αj = 50◦ and Nj = 4 (MIJCC 50 4J).',
  'It can be seen that the flow is characterized by the unsteady impingement of the turbulent jets onto a single',
 ]);
 assertCoverage(items,page.sentences,c.page,new Set(c.bodyIndices),geometry);
 const layout=readingLines(items,c.width,c.height,c.transform);
 for(const degree of [153,166,179,192]){
  const line=layout.lines.find(l=>l.items.some(b=>b.index===degree));
  assert.ok(line.items.some(b=>b.h>items[degree].height*1.15&&b.x>300),'Degree must attach to its local normal-font body line');
  assert.equal(sentenceAtOffset(page.sentences,c.page,degree,0),right[0]);
 }
});

test('underscore identifiers and Unicode subscripts survive repeated variable/value clauses',()=>{
 const items=[item('The selected configurations were compared for',40,70,450),item('αⱼ = 25° and Nⱼ = 2 (MIJCC_25_2J),',40,83,450),item('αⱼ = 50° and Nⱼ = 4 (MIJCC_50_4J). It worked.',40,96,450)];
 const {sentences}=extractPage(items,612,792,1);
 assert.deepEqual(sentences.map(s=>s.text),['The selected configurations were compared for αⱼ = 25° and Nⱼ = 2 (MIJCC_25_2J), αⱼ = 50° and Nⱼ = 4 (MIJCC_50_4J).','It worked.']);
 assertCoverage(items,sentences,1);
});

test('dimensions bound by preceding prose survive without words on their own physical line',()=>{
 const items=[item('The rectangular tank had dimensions of',40,70,450),item('500 mm (L) × 400 mm (W) × 390 mm (H).',40,83,450),item('The tank remained fully submerged.',40,96,450)];
 const {sentences}=extractPage(items,612,792,1);
 assert.deepEqual(sentences.map(s=>s.text),['The rectangular tank had dimensions of 500 mm (L) × 400 mm (W) × 390 mm (H).','The tank remained fully submerged.']);assertCoverage(items,sentences,1);
});

const tableCases=[
 ['numeric cells',['A','1.25','3.50','5.75']],
 ['units and decimals',['Run A','1.25 mm','3.50 mm','5.75 mm']],
 ['plus/minus',['Mean of A','1.2 ± 0.1 mm','3.4 ± 0.2 mm','5.6 ± 0.3 mm']],
 ['scientific notation',['Test A','1.2 × 10⁻⁵ m/s','−3.4e−6 Pa','5.6E+3 kg']],
 ['heading-like short labels',['Results','1.2 mm','3.4 mm','5.6 mm']],
 ['misleading hyphen continuation',['sions of','500 mm','400 mm','390 mm']],
];
for(const [name,cells]of tableCases)test(`genuine aligned table rows remain excluded: ${name}`,()=>{
 const items=[item('The measured quantities were recorded with dimen-',40,70,500)];
 for(let row=0;row<3;row++)cells.forEach((text,col)=>items.push(item(text,40+col*130,83+row*13,col===0?75:100)));
 items.push(item('The next body paragraph describes the instruments.',40,135,500));
 const {sentences}=extractPage(items,612,792,1),intended=new Set([0,items.length-1]);
 assert.deepEqual(sentences.map(s=>s.text),[items[0].str,items.at(-1).str]);
 assertCoverage(items,sentences,1,intended);
});

test('an isolated sparse data row with units is not rescued just by nearby unfinished prose',()=>{
 const items=[item('Measurements were obtained for',40,70,450),item('A 12 mm 14 mm 16 mm',40,83,240),item('The next paragraph explains the method.',40,96,450)];
 const {sentences}=extractPage(items,612,792,1);assert.deepEqual(sentences.map(s=>s.text),[items[0].str,items[2].str]);assertCoverage(items,sentences,1,new Set([0,2]));
});

test('prose context does not rescue expressions across column, font, gap or caption boundaries',()=>{
 for(const [x,y,font,prefix]of [[320,83,'body','The conditions were measured with'],[40,140,'body','The conditions were measured with'],[40,83,'other','The conditions were measured with'],[40,83,'body','Table 2. Measured conditions with']]){
  const items=[item(prefix,40,70,230),item('αⱼ = 25° and Nⱼ = 2 (MIJCC_25_2J),',x,y,230,10,font)];
  const {sentences}=extractPage(items,612,792,1);assert.ok(!sentences.some(s=>s.runs.some(r=>r.itemIndex===1)));
 }
});
