/** Pure geometry/segmentation. PDF user units, never screen pixels. */
export function sentenceRanges(text) {
 const ranges=[]; let start=0;
 const abbr=/\b(?:figs?|eqs?|refs?|dr|mr|mrs|prof|vs|al|no|nos|vol|pp|approx|dept|inc|i\.e|e\.g)$/i;
 for(let i=0;i<text.length;i++){
  const c=text[i]; if(!/[.!?。！？]/.test(c))continue;
  if(c==='.' && (/\d/.test(text[i-1]||'')&&/\d/.test(text[i+1]||'')))continue;
  if(c==='.' && (abbr.test(text.slice(start,i)) || /(?:\b[A-Z]|\b[A-Za-z](?:\.[A-Za-z])+)$/u.test(text.slice(start,i))))continue;
  if(c==='.' && /[a-z]/.test(text[i+1]||''))continue;
  let end=i+1; while(/["'”’\])]/.test(text[end]||'\0'))end++;
  // Attach numbered citations after a sentence, instead of making a new sentence.
  const cite=text.slice(end).match(/^\s*\[\d[\d,\s–-]*\]/); if(cite)end+=cite[0].length;
  if(end<text.length && !/\s/.test(text[end]))continue;
  if(text.slice(start,end).trim())ranges.push({start,end,complete:true});
  start=end; while(/\s/.test(text[start]||'\0'))start++; i=start-1;
 }
 if(text.slice(start).trim())ranges.push({start,end:text.length,complete:false});
 return ranges;
}
export function readingLines(items,width,height){
 const boxes=items.map((it,index)=>({index,text:it.str,x:it.transform[4],y:height-it.transform[5],w:it.width,h:Math.max(Math.hypot(it.transform[2],it.transform[3]),it.height||0,1)})).filter(b=>b.text?.trim()&&b.w>0&&b.y>height*.06&&b.y<height*.965);
 const sizes=boxes.filter(b=>b.text.length>35).map(b=>b.h).sort((a,b)=>a-b);const bodySize=sizes[Math.floor(sizes.length/2)]||10;
 const rows=[];
 // Establish normal baselines before attaching superscripts/subscripts.
 for(const b of [...boxes].sort((a,b)=>b.h-a.h||a.y-b.y)){
  let row=rows.filter(r=>Math.abs(r.y-b.y)<Math.max(r.h,b.h)*(b.h<bodySize*.82?.85:.36)).sort((a,c)=>Math.abs(a.y-b.y)-Math.abs(c.y-b.y))[0];
  if(!row){row={y:b.y,h:b.h,items:[]};rows.push(row)}row.items.push(b);
 }
 for(const r of rows)r.items.sort((a,b)=>a.x-b.x);
 const candidates=[];
 for(let f=.24;f<=.67;f+=.01){const x=width*f;let left=0,right=0,cross=0,splits=0;
  for(const r of rows){
   const l=r.items.filter(b=>b.text.length>22&&b.x+b.w<x-5),rr=r.items.filter(b=>b.text.length>22&&b.x>x+5);
   left+=l.length;right+=rr.length;if(l.length&&rr.length)splits++;
   if(r.items.some(b=>b.x<x-5&&b.x+b.w>x+5))cross++;
  } candidates.push({x,score:Math.min(left,right)*2+splits*.5-cross*.7,left,right});
 }
 const best=candidates.sort((a,b)=>b.score-a.score||Math.abs(a.x-width/2)-Math.abs(b.x-width/2))[0];
 const gutter=best&&best.left>=3&&best.right>=3&&best.score>=3?best.x:null;
 let lines=[];
 for(const r of rows.sort((a,b)=>a.y-b.y)){
  // Geometric gaps prevent keyword/abstract or adjacent-column interleaving.
  const groups=[];let group=[];let end=-Infinity;
  for(const b of r.items){if(group.length&&b.x-end>Math.max(13,r.h*1.7)){groups.push(group);group=[]}group.push(b);end=Math.max(end,b.x+b.w)}if(group.length)groups.push(group);
  for(const g of groups){lines.push({y:r.y,h:Math.max(...g.map(b=>b.h)),x:g[0].x,right:Math.max(...g.map(b=>b.x+b.w)),items:g,col:!gutter?'full':g[0].x>=gutter?'right':Math.max(...g.map(b=>b.x+b.w))<=gutter?'left':'full'});}
 }
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
function prose(line){
 const t=line.items.map(b=>b.text).join(' ').trim();
 if(line.y<18||t.length<3||/^\d+$/.test(t))return false;
 if(/^(?:Fig(?:ure)?\.?|Table|Scheme)\s*\d+(?:\.|\s*$)/i.test(t))return false;
 const letters=(t.match(/[a-zA-Z]/g)||[]).length;
 if(letters<Math.max(4,t.length*.42))return false;
 if(line.items.length>=4&&(t.match(/\b\d+(?:\.\d+)?\b/g)||[]).length>=3&&line.items.filter(b=>b.text.trim().split(/\s+/).length<=3).length>=line.items.length*.75)return false;
 if(/[=∑∫√≈≤≥]/.test(t)&&t.length<100)return false;
 // Numeric table rows, references, and short axis labels remain selectable manually.
 if((t.match(/\b\d+(?:\.\d+)?\b/g)||[]).length>4&&letters<t.length*.65)return false;
 return true;
}
export function extractPage(items,width,height,page){
 const {lines,gutter,bodySize}=readingLines(items,width,height);
 const nomenclature=lines.find(l=>/^Nomenclature$/i.test(l.items.map(b=>b.text).join(' ').trim()));
 let definitionEnd=-1;
 if(nomenclature){const ys=[...new Set(lines.filter(l=>l.y>=nomenclature.y).map(l=>l.y))].sort((a,b)=>a-b);definitionEnd=ys.at(-1);for(let i=1;i<ys.length;i++)if(ys[i]-ys[i-1]>bodySize*4){definitionEnd=ys[i-1]+bodySize;break}}
 const steps=lines.slice(1).map((l,i)=>l.col===lines[i].col?l.y-lines[i].y:0).filter(d=>d>bodySize*.7&&d<bodySize*2.8).sort((a,b)=>a-b);const lineStep=steps[Math.floor(steps.length/2)]||bodySize*1.3;
 const blocks=[];let block=null;let previous=null;let caption=null;let definitions=false;let lastY=0;let lastCol='';
 for(const line of lines){
  const lineText=line.items.map(b=>b.text).join(' ').trim();
  definitions=!!nomenclature&&line.y>=nomenclature.y&&line.y<=definitionEnd;
  const isCaption=/^(?:Fig(?:ure)?\.?|Table|Scheme)\s*\d+(?:\.|\s*$)/i.test(lineText);
  if(isCaption)caption={y:line.y,col:line.col,h:line.h};
  else if(caption&&(line.col!==caption.col||Math.abs(line.y-caption.y)>caption.h*1.8))caption=null;
  else if(caption)caption.y=line.y;
  const valid=prose(line)&&!caption&&!definitions;
  lastY=line.y;lastCol=line.col;
  const gap=previous?Math.abs(line.y-previous.y):0;
  const newBlock=!block||!valid||!previous||line.col!==previous.col||gap>Math.max(Math.max(line.h,previous.h)*1.85,lineStep*1.6)||line.x>previous.x+line.h*1.1||Math.abs(line.h-previous.h)>line.h*.28;
  if(newBlock)block=null;
  if(!valid){previous=null;continue}
  if(!block){block={text:'',map:[],lines:[],page,id:`p${page}-b${blocks.length}`};blocks.push(block)}
  let inLine=false;
  for(const b of line.items){
   const previousItem=block.map.at(-1);const sameLine=inLine;
   const lastBox=previousItem?items[previousItem.itemIndex]:null;
   let sep=block.text?' ':'';
   if(sameLine&&lastBox&&b.x-(lastBox.transform[4]+lastBox.width)<1.4)sep='';
   if(block.text.endsWith('-')&&/^[a-z]/.test(b.text)&&!inLine){block.text=block.text.slice(0,-1);const last=block.map.at(-1);if(last)last.end--;sep=''}
   const begin=block.text.length+sep.length;block.text+=sep+b.text;block.map.push({start:begin,end:block.text.length,itemIndex:b.index,itemStart:0});inLine=true;
  }
  block.lines.push(line);previous=line;
 }
 const sentences=[];
 for(const b of blocks){
  if(b.text.split(/\s+/).length<7&&(!/[.!?]$/.test(b.text)||b.text.length<25))continue;
  for(const r of sentenceRanges(b.text)){
   const text=b.text.slice(r.start,r.end).trim();if(text.length<3)continue;
   const runs=b.map.filter(m=>m.end>r.start&&m.start<r.end).map(m=>({page,itemIndex:m.itemIndex,start:Math.max(r.start,m.start)-m.start,end:Math.min(r.end,m.end)-m.start}));
   sentences.push({id:`p${page}-i${runs[0]?.itemIndex}-${runs[0]?.start}`,page,text,runs,blockId:b.id,complete:r.complete,context:b.text,col:b.lines[0]?.col});
  }
 }
 return {page,width,height,gutter,blocks:blocks.map(b=>({id:b.id,text:b.text})),sentences,text:items.map(i=>i.str).join(' '),itemCount:items.filter(i=>i.str?.trim()).length};
}
/** Merge genuine continuations between columns/pages; don't guess across headings. */
export function joinContinuations(pages){
 const result=[];
 for(const page of pages){for(const s of page.sentences){
  const prev=result.at(-1);
  if(prev&&!prev.complete&&(prev.runs.at(-1).page!==s.page||prev.col!==s.col)&&prev.text.length>45&&s.text.length>12&&/^[a-z(]/.test(s.text)&&!/^\s*(?:references|acknowledg)/i.test(s.text)){
   const hyphen=prev.text.endsWith('-');prev.text=prev.text.slice(0,hyphen?-1:undefined)+(hyphen?'':' ')+s.text;prev.runs.push(...s.runs);prev.complete=s.complete;prev.context+=' '+s.context;
  }else result.push({...s,runs:[...s.runs]});
 }}return result;
}
