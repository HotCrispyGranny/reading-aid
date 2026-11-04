import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractPage,joinContinuations} from '../src/lib/sentences.mjs';
import {itemRect} from '../src/lib/highlight-geometry.mjs';

const item=(str,x,y,width)=>({str,width,height:11,transform:[11,0,0,11,x,792-y]});
// Deliberately nonuniform advances: normalized-text lengths or proportional
// string searches would clip different characters than the physical runs.
function geometry(it){
 const advances=[0];for(let i=0;i<it.str.length;i++)advances.push(advances.at(-1)+2+i%4);
 const factor=it.width/advances.at(-1);
 return {x:it.transform[4],y:792-it.transform[5]-9,h:12,rotated:false,advances:advances.map(v=>v*factor)};
}

test('partial highlight rectangles use original offsets after whitespace normalization',()=>{
 const it=item('  First    sentence.  Next sentence.  ',40,70,280),g=geometry(it);
 const p=extractPage([it],612,792,1);
 const r=p.sentences[1].runs[0];
 assert.equal(it.str.slice(r.start,r.end),'Next sentence.');
 assert.deepEqual(itemRect(g,r.start,r.end,r.page),{page:1,x:40+g.advances[r.start],y:61,w:g.advances[r.end]-g.advances[r.start],h:12});
 assert.ok(r.start>p.sentences[0].text.length);
});

test('wrapped dehyphenated sentences highlight every physical line including the printed hyphen',()=>{
 const items=[item('The value was ap',40,70,150),item('-',190,70,3),item('proximately constant.',40,85,180)];
 const [sentence]=extractPage(items,612,792,1).sentences;
 assert.equal(sentence.text,'The value was approximately constant.');
 const rects=sentence.runs.map(r=>itemRect(geometry(items[r.itemIndex]),r.start,r.end,r.page));
 assert.deepEqual(rects,[{page:1,x:40,y:61,w:150,h:12},{page:1,x:190,y:61,w:3,h:12},{page:1,x:40,y:76,w:180,h:12}]);
});

test('cross-page continuations clip each page using that page geometry and original source runs',()=>{
 const items=[item('The value was ap-',40,710,160),item('proximately constant. Next result.',80,70,260)];
 const pages=items.map((it,i)=>extractPage([it],612,792,i+1));
 const [sentence,next]=joinContinuations(pages);
 assert.equal(sentence.text,'The value was approximately constant.');
 assert.deepEqual(sentence.runs.map(r=>r.page),[1,2]);
 const rects=sentence.runs.map(r=>itemRect(geometry(items[r.page-1]),r.start,r.end,r.page));
 const g=geometry(items[1]),end='proximately constant.'.length;
 assert.deepEqual(rects,[{page:1,x:40,y:701,w:160,h:12},{page:2,x:80,y:61,w:g.advances[end],h:12}]);
 assert.equal(next.runs[0].start,end+1);
 assert.ok(rects.every(r=>r.w>0&&r.x+r.w<=612));
});

test('UTF-16 offsets survive non-BMP text and repeated identical sentences',()=>{
 const it=item('The 😀 result was stable. The 😀 result was stable.',40,70,400);
 const p=extractPage([it],612,792,1);assert.equal(p.sentences.length,2);
 assert.equal(p.sentences[0].text,p.sentences[1].text);
 const rects=p.sentences.map(s=>{const r=s.runs[0];assert.equal(it.str.slice(r.start,r.end),s.text);return itemRect(geometry(it),r.start,r.end,1)});
 assert.ok(rects[1].x>rects[0].x+rects[0].w);
 assert.notEqual(p.sentences[0].id,p.sentences[1].id);
});

test('unsupported geometry keeps the existing DOM fallback available',()=>{
 assert.equal(itemRect(undefined,0,1,1),null);
 assert.equal(itemRect({rotated:true,advances:[0,5]},0,1,1),null);
 assert.equal(itemRect({rotated:false,advances:[]},0,1,1),null);
});

test('real PDF.js extraction keeps wrapped headings, captions and cross-page source coordinates',async()=>{
 const {PDFDocument,StandardFonts}=await import('pdf-lib');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const document=await PDFDocument.create();
 const body=await document.embedFont(StandardFonts.TimesRoman),heading=await document.embedFont(StandardFonts.TimesRomanItalic);
 const first=document.addPage([612,792]);
 const draw=(p,text,x,y,font=body,size=11)=>p.drawText(text,{x,y,font,size});
 draw(first,'6.1. Suspension bed height measurements in laboratory-scale',40,720,heading);
 draw(first,'precipitators',40,705,heading);
 draw(first,'The suspension height was ap-',40,675);
 draw(first,'proximately constant under controlled conditions.',40,660);
 draw(first,'Fig. 12. Measured suspension height.',40,630,body,9);
 draw(first,'We compared',40,600);
 const second=document.addPage([612,792]);
 draw(second,'NASA data. It worked.',60,720);
 const pdf=await pdfjs.getDocument({data:await document.save(),useSystemFonts:true}).promise;
 try{
  const extracted=[],sources=[];
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number),content=await page.getTextContent(),view=page.getViewport({scale:1});
   const items=content.items.filter(it=>'str' in it);sources.push(items);
   extracted.push(extractPage(items,view.width,view.height,number));
  }
  const sentences=joinContinuations(extracted);
  assert.deepEqual(sentences.map(s=>[s.kind,s.text]),[
   ['heading','6.1. Suspension bed height measurements in laboratory-scale precipitators'],
   ['body','The suspension height was approximately constant under controlled conditions.'],
   ['caption','Fig. 12. Measured suspension height.'],
   ['body','We compared NASA data.'],
   ['body','It worked.'],
  ]);
  for(const s of sentences)for(const r of s.runs){
   const it=sources[r.page-1][r.itemIndex];
   assert.ok(r.start>=0&&r.end>r.start&&r.end<=it.str.length);
   const rect=itemRect(geometry(it),r.start,r.end,r.page);
   assert.ok(rect.w>0&&rect.x>=0&&rect.x+rect.w<=612);
  }
  const continuation=sentences[3];
  assert.deepEqual(continuation.runs.map(r=>r.page),[1,2]);
  const continuationRects=continuation.runs.map(r=>itemRect(geometry(sources[r.page-1][r.itemIndex]),r.start,r.end,r.page));
  assert.equal(continuationRects[0].x,40);assert.equal(continuationRects[1].x,60);
  assert.equal(continuationRects[0].y,183);assert.equal(continuationRects[1].y,63);
 }finally{await pdf.destroy()}
});
