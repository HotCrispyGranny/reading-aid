/** Pure geometry/segmentation. PDF user units, never screen pixels. */
export function sentenceRanges(text) {
 const ranges=[]; let start=0;
 const abbr=/\b(?:figs?|eqs?|refs?|dr|mr|mrs|prof|vs|al|no|nos|vol|pp|approx|dept|inc|i\.e|e\.g)$/i;
 for(let i=0;i<text.length;i++){
  const c=text[i]; if(!/[.!?。！？]/.test(c))continue;
  if(c==='.' && (/\d/.test(text[i-1]||'')&&/\d/.test(text[i+1]||'')))continue;
  const prefix=text.slice(start,i);
  // Section and caption labels belong to the following text, not their own unit.
  if(c==='.' && (/^\s*\d+(?:\.\d+)*$/.test(prefix)||/^\s*(?:fig(?:ure)?s?\.?|table|scheme)\s+(?:\d+[a-z]?|[IVXLCDM]+)$/i.test(prefix)))continue;
  const initial=/(?:(?:^|\s|\()[A-Z]|\b[A-Za-z](?:\.[A-Za-z])+)$/u.test(prefix)&&!/\d\s+[A-Z]$/.test(prefix);
  if(c==='.' && (abbr.test(prefix)||initial))continue;
  if(c==='.' && /[a-z]/.test(text[i+1]||''))continue;
  let end=i+1; while(/["'”’\])]/.test(text[end]||'\0'))end++;
  // Scientific PDFs often use unbracketed superscript reference numbers.
  const superscript=text.slice(end).match(/^\d+(?:[,–-]\d+)*(?=\s|$)/);if(superscript)end+=superscript[0].length;
  // Attach numbered citations after a sentence, instead of making a new sentence.
  let cite;while((cite=text.slice(end).match(/^\s*\[\d[\d,\s–-]*\]/)))end+=cite[0].length;
  if(end<text.length && !/\s/.test(text[end]))continue;
  if(text.slice(start,end).trim())ranges.push({start,end,complete:true});
  start=end; while(/\s/.test(text[start]||'\0'))start++; i=start-1;
 }
 if(text.slice(start).trim())ranges.push({start,end:text.length,complete:false});
 return ranges;
}
export function readingLines(items,width,height){
 const boxes=items.map((it,index)=>({index,text:it.str,font:it.fontName,x:it.transform[4],y:height-it.transform[5],w:it.width,h:Math.max(Math.hypot(it.transform[2],it.transform[3]),it.height||0,1)})).filter(b=>b.text?.trim()&&b.w>0&&b.y>height*.06&&b.y<height*.965);
 // Weight by letters so item splitting and a few large title glyphs do not
 // change which font size represents the body.
 const sizes=boxes.map(b=>({h:b.h,weight:(b.text.match(/\p{L}/gu)||[]).length})).sort((a,b)=>a.h-b.h);
 let remaining=sizes.reduce((n,b)=>n+b.weight,0)/2,bodySize=10;
 for(const b of sizes){remaining-=b.weight;if(b.weight&&remaining<=0){bodySize=b.h;break}}
 const rows=[];
 // Establish normal baselines before attaching superscripts/subscripts.
 for(const b of [...boxes].sort((a,b)=>b.h-a.h||a.y-b.y)){
  const small=b.h<bodySize*.82;
  let row=rows.filter(r=>Math.abs(r.y-b.y)<Math.max(r.h,b.h)*(small?.85:.36)&&(!small||r.items.some(it=>it.h>b.h*1.15&&b.x<=it.x+it.w+bodySize*2&&b.x+b.w>=it.x-bodySize*2))).sort((a,c)=>Math.abs(a.y-b.y)-Math.abs(c.y-b.y))[0];
  if(!row){row={y:b.y,h:b.h,items:[]};rows.push(row)}row.items.push(b);
 }
 for(const r of rows)r.items.sort((a,b)=>a.x-b.x);
 let lines=[];
 for(const r of rows.sort((a,b)=>a.y-b.y)){
  // Geometric gaps prevent keyword/abstract or adjacent-column interleaving.
  const groups=[];let group=[];let end=-Infinity;
  for(const b of r.items){
   const number=group.length&&/^\d+(?:\.\d+)*\.$/.test(group.map(b=>b.text).join('').trim());
   if(group.length&&b.x-end>Math.max(13,r.h*(number?4:1.7))){groups.push(group);group=[]}
   group.push(b);end=Math.max(end,b.x+b.w);
  }if(group.length)groups.push(group);
  for(const g of groups){const line={y:r.y,h:Math.max(...g.map(b=>b.h)),x:g[0].x,right:Math.max(...g.map(b=>b.x+b.w)),items:g};line.text=lineText(line);lines.push(line);}
 }
 // Infer columns from physical lines, not individual text items: PDFs may emit
 // a line as one item, separate words, or even separate ligatures/glyphs.
 const candidates=[];
 for(let f=.24;f<=.67;f+=.01){const x=width*f;let left=0,right=0,cross=0;
  for(const l of lines){
   if(l.text.length<=22)continue;
   if(l.right<x-5)left++;else if(l.x>x+5)right++;else if(l.x<x-5&&l.right>x+5)cross++;
  }candidates.push({x,score:Math.min(left,right)*2-cross*.7,left,right});
 }
 const best=candidates.sort((a,b)=>b.score-a.score||Math.abs(a.x-width/2)-Math.abs(b.x-width/2))[0];
 const gutter=best&&best.left>=3&&best.right>=3&&best.score>=3?best.x:null;
 for(const l of lines)l.col=!gutter?'full':l.x>=gutter?'right':l.right<=gutter?'left':'full';
 if(gutter){
  const full=lines.filter(l=>l.col==='full').sort((a,b)=>a.y-b.y);const ordered=[];let lower=-Infinity;
  for(const boundary of [...full,{y:Infinity}]){
   const band=lines.filter(l=>l.col!=='full'&&l.y>=lower&&l.y<boundary.y);
   ordered.push(...band.filter(l=>l.col==='left').sort((a,b)=>a.y-b.y),...band.filter(l=>l.col==='right').sort((a,b)=>a.y-b.y));
   if(boundary.y!==Infinity)ordered.push(boundary);lower=boundary.y+.1;
  }lines=ordered;
 }else lines.sort((a,b)=>a.y-b.y||a.x-b.x);
 return {lines,gutter,bodySize};
}
function lineText(line){
 let text='',previous=null;
 for(const b of line.items){
  const touching=previous&&b.x-previous.x-previous.w<1.4&&!/\s$/.test(previous.text)&&!/^\s/.test(b.text);
  text+=(text&&!touching?' ':'')+b.text.trim().replace(/\s+/gu,' ');previous=b;
 }return text;
}
function prose(line){
 const t=line.text;
 if(t.length<2||/^\d+$/.test(t))return false;
 const letters=(t.match(/\p{L}/gu)||[]).length;
 if(letters<Math.max(4,t.length*.42))return false;
 if(line.items.length>=4&&(t.match(/\b\d+(?:\.\d+)?\b/g)||[]).length>=3&&line.items.filter(b=>b.text.trim().split(/\s+/).length<=3).length>=line.items.length*.75)return false;
 if(/[=∑∫√≈≤≥]/.test(t)&&(t.match(/\p{L}{3,}/gu)||[]).length<3)return false;
 // Numeric table rows, references, and short axis labels remain selectable manually.
 if((t.match(/\b\d+(?:\.\d+)?\b/g)||[]).length>4&&letters<t.length*.65)return false;
 return true;
}
export function extractPage(items,width,height,page){
 const {lines,gutter,bodySize}=readingLines(items,width,height);
 const nomenclature=lines.find(l=>/^Nomenclature$/i.test(l.items.map(b=>b.text).join(' ').trim()));
 let definitionEnd=-1;
 if(nomenclature){const ys=[...new Set(lines.filter(l=>l.y>=nomenclature.y).map(l=>l.y))].sort((a,b)=>a-b);definitionEnd=ys.at(-1);for(let i=1;i<ys.length;i++)if(ys[i]-ys[i-1]>bodySize*4){definitionEnd=ys[i-1]+bodySize;break}}
 const steps=lines.slice(1).map((l,i)=>l.col===lines[i].col?l.y-lines[i].y:0).filter(d=>d>bodySize*.7&&d<bodySize*1.9).sort((a,b)=>a-b);const lineStep=steps[Math.floor(steps.length/2)]||bodySize*1.3;
 const columnRight=new Map(),columnLeft=new Map();for(const l of lines){columnRight.set(l.col,Math.max(columnRight.get(l.col)||0,l.right));if(prose(l))columnLeft.set(l.col,Math.min(columnLeft.get(l.col)??Infinity,l.x))}
 const blocks=[];let block=null;let previous=null;
 for(const line of lines){
  const numberOnly=/^\d+(?:\.\d+)*\.$/.test(line.text);
  const captionLabel=line.text.match(/^(?:fig(?:ure)?s?\.?|table|scheme)\s*(?:\d+[a-z]?|[IVXLCDM]+\b)(.*)$/i);
  const isCaption=!!captionLabel&&(!captionLabel[1].trim()||/^[.:]/.test(captionLabel[1])||line.h<bodySize*.96||/^\s+\p{Lu}/u.test(captionLabel[1]));
  const headingLabel=numberOnly||/^\d+(?:\.\d+)*\.?\s+\p{Lu}/u.test(line.text)||/^(?:abstract|introduction|results(?: and discussion)?|conclusions?|references|acknowledg(?:e)?ments?|nomenclature)$/i.test(line.text);
  const isHeading=!isCaption&&(headingLabel||line.h>bodySize*1.2);
  let kind=isCaption?'caption':isHeading?'heading':'body';
  const definitions=!!nomenclature&&line.y>=nomenclature.y&&line.y<=definitionEnd;
  const valid=(prose(line)||isCaption||isHeading)&&!definitions;
  const gap=previous?Math.abs(line.y-previous.y):0;
  const sameStyle=previous&&Math.abs(line.h-previous.h)<line.h*.15&&line.items[0].font===previous.items[0].font;
  const nearEdge=previous&&previous.right>=(columnRight.get(previous.col)||width)-previous.h*5;
  const wrapped=block&&previous&&line.col===previous.col&&gap<=lineStep*1.35&&sameStyle&&line.x<=previous.x+line.h*1.1;
  if(kind==='body'&&wrapped&&block.kind!=='body'&&(!/[.!?。！？]["'”’\])]*$/.test(block.text)||nearEdge&&/^\p{Ll}/u.test(line.text))&&(nearEdge||block.kind==='caption'||/^\d+(?:\.\d+)*\.$/.test(block.text)))kind=block.kind;
  const newBlock=!block||!valid||!previous||kind!==block.kind||headingLabel||isCaption||(isHeading&&!(wrapped&&nearEdge))||line.col!==previous.col||gap>Math.max(Math.max(line.h,previous.h)*1.85,lineStep*1.6)||(line.x>previous.x+line.h*1.1&&sentenceRanges(block.text).at(-1)?.complete)||Math.abs(line.h-previous.h)>line.h*.28;
  if(newBlock)block=null;
  if(!valid){previous=null;continue}
  if(!block){block={text:'',map:[],lines:[],page,kind,id:`p${page}-b${blocks.length}`};blocks.push(block)}
  let lastBox=null;
  for(const b of line.items){
   const raw=b.text;const leading=raw.length-raw.trimStart().length;const value=raw.trim();
   let sep=block.text?' ':'';
   if(lastBox&&b.x-lastBox.x-lastBox.w<1.4&&!/\s$/.test(lastBox.text)&&!/^\s/.test(raw))sep='';
   if(!lastBox&&/\p{L}[-\u00ad]$/u.test(block.text)&&/^\p{L}/u.test(value)){
    if(discretionaryHyphen(block.text,value)){
     block.text=block.text.slice(0,-1);block.map.at(-1).end--;
    }sep='';
   }
   block.text+=sep;
   for(const match of value.matchAll(/\s+|\S+/gu)){
    const start=block.text.length;block.text+=/^\s/u.test(match[0])?' ':match[0];
    block.map.push({start,end:block.text.length,itemIndex:b.index,itemStart:leading+match.index,itemEnd:leading+match.index+match[0].length});
   }lastBox=b;
  }
  block.lines.push(line);previous=line;
 }
 const sentences=[];
 for(const b of blocks){
  if(!/\p{L}/u.test(b.text))continue;
  const ranges=b.kind==='heading'?[{start:0,end:b.text.length,complete:true}]:sentenceRanges(b.text);
  for(const r of ranges){
   const text=b.text.slice(r.start,r.end).trim();if(!text)continue;
   const runs=sourceRuns(b.map,r,page);
   const first=b.lines[0],last=b.lines.at(-1);
   sentences.push({id:`p${page}-i${runs[0]?.itemIndex}-${runs[0]?.start}`,page,text,runs,kind:b.kind,blockId:b.id,complete:r.complete,context:b.text,col:first.col,
    continuationStart:r.start===0&&first.x<=(columnLeft.get(first.col)??first.x)+bodySize*.6,font:first.items[0].font,endFont:last.items[0].font,fontSize:first.h,endFontSize:last.h});
  }
 }
 return {page,width,height,gutter,blocks:blocks.map(b=>({id:b.id,text:b.text,kind:b.kind})),sentences,text:items.map(i=>i.str).join(' '),itemCount:items.filter(i=>i.str?.trim()).length};
}
/** A printed hyphen remains in sourceRuns even when removed from logical text.
 * Preserve common scientific compounds; plain-text PDFs cannot disambiguate
 * every hard hyphen. Soft hyphens explicitly mark discretionary word breaks. */
function discretionaryHyphen(left,right){
 const word=left.match(/([\p{L}]+)([-\u00ad])$/u);if(!word||!/^\p{Ll}/u.test(right))return false;
 if(word[2]==='\u00ad')return true;
 const first=word[1].toLowerCase(),second=right.match(/^\p{L}+/u)?.[0].toLowerCase();
 return !/^(?:non|semi|quasi|self|well|ill|two|three|multi)$/i.test(first)&&!/^(?:scale|based|dimensional|phase|order|state|known|free|like|term|time)$/i.test(second);
}
function sourceRuns(map,range,page){
 const runs=[];
 for(const m of map){
  // A removed line-break hyphen has zero logical width, but still owns its
  // original source characters. Include it inside the reconstructed word.
  const deleted=m.start===m.end;
  if(deleted?m.start<=range.start||m.start>=range.end:m.end<=range.start||m.start>=range.end)continue;
  const start=m.itemStart+Math.max(0,range.start-m.start);
  const end=range.end>=m.end?m.itemEnd:m.itemStart+range.end-m.start;
  const previous=runs.at(-1);
  if(previous?.itemIndex===m.itemIndex&&previous.end===start)previous.end=end;
  else runs.push({page,itemIndex:m.itemIndex,start,end});
 }return runs;
}
/** Merge genuine continuations between columns/pages; don't guess across headings. */
export function joinContinuations(pages){
 const result=[];
 for(const page of pages){for(const s of page.sentences){
  const prev=result.at(-1);
  const lastPage=prev?.runs.at(-1).page;
  const boundary=lastPage===s.page?prev.col==='left'&&s.col==='right':lastPage+1===s.page;
  const sameStyle=prev&&prev.endFont===s.font&&Math.abs(prev.endFontSize-s.fontSize)<s.fontSize*.2;
  if(prev&&!prev.complete&&prev.kind==='body'&&s.kind==='body'&&s.continuationStart&&sameStyle&&boundary){
   const hyphen=/\p{L}[-\u00ad]$/u.test(prev.text)&&/^\p{L}/u.test(s.text);
   prev.text=prev.text.slice(0,hyphen&&discretionaryHyphen(prev.text,s.text)?-1:undefined)+(hyphen?'':' ')+s.text;prev.runs.push(...s.runs);prev.complete=s.complete;prev.context+=' '+s.context;prev.col=s.col;prev.endFont=s.endFont;prev.endFontSize=s.endFontSize;
  }else result.push({...s,runs:[...s.runs]});
 }}return result;
}
/** Navigate the logical index; a page continuation belongs to its starting unit. */
export function stepSentence(sentences,id,page,delta){
 if(!sentences.length)return undefined;
 const current=sentences.findIndex(s=>s.id===id);
 if(current>=0)return sentences[Math.max(0,Math.min(sentences.length-1,current+delta))];
 const initial=sentences.findIndex(s=>s.runs.some(r=>r.page>=page));
 return sentences[initial<0?sentences.length-1:initial];
}
