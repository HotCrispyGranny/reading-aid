/** Pure geometry/segmentation. PDF user units, never screen pixels. */
export function sentenceRanges(text) {
 const ranges=[]; let start=0;
 const abbr=/\b(?:figs?|eqs?|refs?|secs?|dr|mr|mrs|prof|vs|al|no|nos|vol|pp?|approx|dept|inc|i\.e|e\.g)$/i;
 for(let i=0;i<text.length;i++){
  const c=text[i]; if(!/[.!?…。！？]/.test(c))continue;
  if(c==='.' && (/\d/.test(text[i-1]||'')&&/\d/.test(text[i+1]||'')))continue;
  const prefix=text.slice(start,i);
  // Section and caption labels belong to the following text, not their own unit.
  if(c==='.' && (/^\s*\d+(?:\.\d+)*$/.test(prefix)||/^\s*(?:fig(?:ure)?s?\.?|table|scheme)\s+(?:\d+[a-z]?|[IVXLCDM]+)$/i.test(prefix)))continue;
  const initial=/(?:(?:^|\s|\()[A-Z]|\b[A-Za-z](?:\.[A-Za-z])+)$/u.test(prefix)&&!/\d\s+[A-Z]$/.test(prefix);
  // Names and reference abbreviations remain nonterminal. An explicit new
  // clause after terminal et al./a single-letter unit is useful evidence of a
  // genuine boundary, rather than suppressing all periods near abbreviations.
  const startsClause=/^["'”’»›」』】）\])]*(?:\s*\[\d[\d,\s–-]*\])*\s+(?:The|This|These|Those|It|We|However|Therefore|Moreover|Next|Thus)\b/.test(text.slice(i+1));
  if(c==='.' && (abbr.test(prefix)||initial)&&!((/\bet al$/i.test(prefix)||initial)&&startsClause))continue;
  if(c==='.' && /[a-z]/.test(text[i+1]||''))continue;
  let end=i+1;while(/[.!?…。！？]/.test(text[end]||'\0'))end++;
  if((c==='…'||text.slice(i,end).includes('...'))&&/^\s+\p{Ll}/u.test(text.slice(end)))continue;
  while(/["'”’»›」』】）\])]/.test(text[end]||'\0'))end++;
  // Scientific PDFs often use unbracketed superscript reference numbers.
  const superscript=text.slice(end).match(/^[\d⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:[,–-][\d⁰¹²³⁴⁵⁶⁷⁸⁹]+)*(?=\s|$)/);if(superscript)end+=superscript[0].length;
  // Attach numbered citations after a sentence, instead of making a new sentence.
  let cite;while((cite=text.slice(end).match(/^\s*\[\d[\d,\s–-]*\]/)))end+=cite[0].length;
  if(end<text.length && !/\s/.test(text[end]))continue;
  if(text.slice(start,end).trim())ranges.push({start,end,complete:true});
  start=end; while(/\s/.test(text[start]||'\0'))start++; i=start-1;
 }
 if(text.slice(start).trim())ranges.push({start,end:text.length,complete:false});
 return ranges;
}
/** @param {number[]|null} [viewportTransform] */
export function readingLines(items,width,height,viewportTransform=null){
 // Normalize upright CropBox/UserUnit coordinates into the same viewport frame
 // as highlights, without changing item indices or source strings. Sideways
 // layouts retain the conservative legacy ordering and DOM geometry fallback.
 const t=viewportTransform&&viewportTransform[0]>0&&viewportTransform[3]<0&&!viewportTransform[1]&&!viewportTransform[2]?viewportTransform:[1,0,0,-1,0,height];
 const scale=Math.abs(t[0]);
 const boxes=items.map((it,index)=>({index,text:it.str,font:it.fontName,x:t[0]*it.transform[4]+t[4],y:t[3]*it.transform[5]+t[5],w:it.width*scale,h:Math.max(Math.hypot(it.transform[2],it.transform[3])*scale,(it.height||0)*scale,1)})).filter(b=>b.text?.trim()&&b.w>0&&b.y>height*.06&&b.y<height*.965);
 // Weight by letters so item splitting and a few large title glyphs do not
 // change which font size represents the body.
 const sizes=boxes.map(b=>({h:b.h,weight:(b.text.match(/\p{L}/gu)||[]).length})).sort((a,b)=>a.h-b.h);
 let remaining=sizes.reduce((n,b)=>n+b.weight,0)/2,bodySize=10;
 for(const b of sizes){remaining-=b.weight;if(b.weight&&remaining<=0){bodySize=b.h;break}}
 const rows=[];
 // Establish normal baselines before attaching superscripts/subscripts.
 for(const b of [...boxes].sort((a,b)=>b.h-a.h||a.y-b.y)){
  const small=b.h<bodySize*.82;
  // Small glyphs need LOCAL support even when another column has a similar
  // font size/baseline; otherwise degree marks can attach to distant table rows.
  let row=rows.filter(r=>Math.abs(r.y-b.y)<Math.max(r.h,b.h)*(small?.85:.36)&&(!small||r.items.some(it=>b.x<=it.x+it.w+bodySize*2&&b.x+b.w>=it.x-bodySize*2&&(Math.abs(it.h-b.h)<b.h*.15&&Math.abs(it.y-b.y)<b.h*.36||it.h>b.h*1.15)))).sort((a,c)=>Math.abs(a.y-b.y)-Math.abs(c.y-b.y))[0];
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
 for(let f=.18;f<=.82;f+=.01){const x=width*f;let left=0,right=0,cross=0;
  for(const l of lines){
   if(l.text.length<=22)continue;
   if(l.right<x-5)left++;else if(l.x>x+5)right++;else cross++;
  }candidates.push({x,score:Math.min(left,right)*2-cross*.7,left,right,cross});
 }
 const best=[...candidates].sort((a,b)=>b.score-a.score||Math.abs(a.x-width/2)-Math.abs(b.x-width/2))[0];
 let cuts=best&&best.left>=3&&best.right>=3&&best.score>=3?[best.x]:[];
 // Recognize three columns only with sustained support in every region. A
 // text line touching a proposed gutter counts against it, rather than falling
 // out of all three counters and creating a spurious gap through that line.
 const bands=[];
 for(const c of candidates.filter(c=>c.left>=4&&c.right>=4&&c.cross<=Math.max(1,(c.left+c.right)*.1))){
  const band=bands.at(-1);
  if(band&&c.x-band.at(-1).x<width*.016)band.push(c);else bands.push([c]);
 }
 if(bands.length===2){
  const proposed=bands.map(b=>(b[0].x+b.at(-1).x)/2);
  if(proposed[1]-proposed[0]>width*.18&&[0,1,2].every(i=>lines.filter(l=>l.text.length>22&&l.x>=(proposed[i-1]??0)&&l.right<=(proposed[i]??width)).length>=4))cuts=proposed;
 }
 const gutter=cuts.length===2?cuts:cuts[0]??null;
 for(const l of lines){
  l.columnIndex=cuts.filter(x=>l.x>=x).length;l.columnCount=cuts.length+1;
  l.col=!cuts.length?'full':cuts.some(x=>l.x<x&&l.right>x)?'full':cuts.length===1?['left','right'][l.columnIndex]:['left','middle','right'][l.columnIndex];
 }
 if(cuts.length){
  const full=lines.filter(l=>l.col==='full').sort((a,b)=>a.y-b.y);const ordered=[];let lower=-Infinity;
  for(const boundary of [...full,{y:Infinity}]){
   // Include ties: a misclassified spanning line must never discard every
   // other physical line sharing its baseline.
   const band=lines.filter(l=>l.col!=='full'&&l.y>=lower&&l.y<=boundary.y);
   ordered.push(...band.sort((a,b)=>a.columnIndex-b.columnIndex||a.y-b.y||a.x-b.x));
   if(boundary.y!==Infinity)ordered.push(boundary);lower=boundary.y+.001;
  }lines=ordered;
 }else lines.sort((a,b)=>a.y-b.y||a.x-b.x);
 return {lines,gutter,bodySize};
}
function touching(previous,b){
 if(!previous)return false;
 const gap=b.x-previous.x-previous.w;
 const raisedReference=/^[\d⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:[,–-][\d⁰¹²³⁴⁵⁶⁷⁸⁹]+)*$/.test(b.text.trim())&&b.h<previous.h*.85&&b.y<previous.y-previous.h*.1&&gap<previous.h*.5;
 return raisedReference||gap<Math.max(.5,Math.min(previous.h,b.h)*.14)&&!/\s$/.test(previous.text)&&!/^\s/.test(b.text);
}
function lineText(line){
 let text='',previous=null;
 for(const b of line.items){
  text+=(text&&!touching(previous,b)?' ':'')+b.text.trim().replace(/\s+/gu,' ');previous=b;
 }return text;
}
function lineFont(line){
 const weights=new Map();for(const b of line.items)weights.set(b.font,(weights.get(b.font)||0)+b.text.length);
 return [...weights].sort((a,b)=>b[1]-a[1])[0]?.[0];
}
function prose(line){
 const t=line.text;
 if(t.length<2||/^\d+$/.test(t))return false;
 const letters=(t.match(/\p{L}/gu)||[]).length;
 if(letters<Math.max(4,t.length*.42))return false;
 // Inline citations/math split prose into many short PDF items too. Fragment
 // counts may reject numeric rows only when the reconstructed line lacks prose
 // evidence, never just because a font/baseline change emitted another item.
 const words=(t.match(/\p{L}{3,}/gu)||[]).length;
 if(words<3&&line.items.length>=4&&(t.match(/\b\d+(?:\.\d+)?\b/g)||[]).length>=3&&line.items.filter(b=>b.text.trim().split(/\s+/).length<=3).length>=line.items.length*.75)return false;
 if(/[=∑∫√≈≤≥]/.test(t)&&words<3)return false;
 // Numeric table rows, references, and short axis labels remain selectable manually.
 if((t.match(/\b\d+(?:\.\d+)?\b/g)||[]).length>4&&letters<t.length*.65)return false;
 return true;
}
const grammarWords=new Set('a an the and or for with of at where in to from by between within was were is are has have than that this these those which it can'.split(' '));
function grammarCount(text){return (text.match(/\p{L}+/gu)||[]).filter(word=>grammarWords.has(word.toLowerCase())).length}
/** Table evidence is physical and independent of PDF item count: numeric cells
 * separated by multiple wide gaps, reinforced by repeated aligned columns.
 * This also catches text-label cells that were previously indexed in a table. */
function tableLines(lines){
 const rows=[];
 for(const line of lines){
  let row=rows.find(r=>r.col===line.col&&Math.abs(r.y-line.y)<Math.max(r.h,line.h)*.3);
  if(!row){row={col:line.col,y:line.y,h:line.h,lines:[]};rows.push(row)}row.lines.push(line);
 }
 for(const row of rows){
  const cells=[];
  for(const b of row.lines.flatMap(l=>l.items).sort((a,b)=>a.x-b.x)){
   let cell=cells.at(-1);
   if(!cell||b.x-cell.right>Math.max(8,row.h*1.2)){cell={x:b.x,right:b.x+b.w,text:''};cells.push(cell)}
   cell.right=Math.max(cell.right,b.x+b.w);cell.text+=(cell.text?' ':'')+b.text;
  }
  row.cells=cells;row.numeric=cells.filter(c=>/\d/.test(c.text)).length;
  // Articles in short labels ("Mean of A") do not supply sentence syntax.
  row.language=grammarCount(cells.map(c=>c.text).join(' ').replace(/\b(?:a|an|the)\b/gi,''));
 }
 const blocked=new Set();
 for(const row of rows){
  if(row.cells.length<3||row.numeric<2||row.language>1)continue;
  const repeated=rows.some(other=>other!==row&&other.col===row.col&&Math.abs(other.y-row.y)<=row.h*3&&Math.abs(other.h-row.h)<row.h*.2&&other.numeric>=2&&row.cells.filter(c=>other.cells.some(d=>Math.abs(c.x-d.x)<row.h*.6||Math.abs(c.right-d.right)<row.h*.6)).length>=3);
  if(repeated||row.language===0)for(const line of row.lines)blocked.add(line);
 }
 return blocked;
}
/** Keep the conservative standalone classifier, then admit rejected scientific
 * expressions only with syntax AND body-flow evidence. A nearby unfinished
 * line alone is insufficient; independently detected table rows always veto. */
function bodyProse(lines,bodySize){
 const tables=tableLines(lines),accepted=new Set(lines.filter(l=>prose(l)&&!tables.has(l)));
 const compatible=(a,b)=>a&&b&&a.col===b.col&&Math.abs(a.h-b.h)<b.h*.15&&lineFont(a)===lineFont(b)&&b.y-a.y>b.h*.5&&b.y-a.y<b.h*1.85&&Math.abs(a.x-b.x)<b.h*2;
 const boundary=l=>/^(?:\d+(?:\.\d+)*\.?\s+\p{Lu}|(?:fig(?:ure)?s?\.?|table|scheme)\s*(?:\d+[a-z]?|[IVXLCDM]+)[.:])/iu.test(l.text);
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(accepted.has(line)||tables.has(line)||line.h<bodySize*.85||line.h>bodySize*1.2)continue;
  const text=line.text,language=grammarCount(text);
  if(!/\d/.test(text)||!/[=×±°◦]|\d\s*[\p{L}µμ]{1,4}\b/u.test(text))continue;
  const previous=lines[i-1],next=lines[i+1];
  const continuing=compatible(previous,line)&&accepted.has(previous)&&!boundary(previous)&&!sentenceRanges(previous.text).at(-1)?.complete;
  const hyphen=continuing&&/\p{L}[-\u00ad]$/u.test(previous.text)&&/^\p{L}/u.test(text);
  const following=compatible(line,next)&&accepted.has(next)&&!boundary(next);
  const linked=/\b(?:and|or|for|with|of|at|where|in|to|from|by|between|within)\b/i.test(text);
  const boundDimensions=continuing&&following&&/\b(?:of|with|at|for)\s*$/i.test(previous.text)&&/×/.test(text);
  const standalone=language>=3&&/\b(?:was|were|is|are|has|have)\b/i.test(text)&&following;
  if(continuing&&linked||hyphen&&language>0||boundDimensions||standalone)accepted.add(line);
 }
 return {accepted,tables};
}
/** @param {number[]|null} [viewportTransform] */
export function extractPage(items,width,height,page,viewportTransform=null){
 const {lines,gutter,bodySize}=readingLines(items,width,height,viewportTransform);
 const {accepted:bodyLines,tables}=bodyProse(lines,bodySize);
 const nomenclature=lines.find(l=>/^Nomenclature$/i.test(l.items.map(b=>b.text).join(' ').trim()));
 let definitionEnd=-1;
 if(nomenclature){const ys=[...new Set(lines.filter(l=>l.y>=nomenclature.y).map(l=>l.y))].sort((a,b)=>a-b);definitionEnd=ys.at(-1);for(let i=1;i<ys.length;i++)if(ys[i]-ys[i-1]>bodySize*4){definitionEnd=ys[i-1]+bodySize;break}}
 const steps=lines.slice(1).map((l,i)=>l.col===lines[i].col?l.y-lines[i].y:0).filter(d=>d>bodySize*.7&&d<bodySize*1.9).sort((a,b)=>a-b);const lineStep=steps[Math.floor(steps.length/2)]||bodySize*1.3;
 const columnRight=new Map(),columnLeft=new Map();for(const l of lines){columnRight.set(l.col,Math.max(columnRight.get(l.col)||0,l.right));if(bodyLines.has(l))columnLeft.set(l.col,Math.min(columnLeft.get(l.col)??Infinity,l.x))}
 const blocks=[];let block=null;let previous=null;
 for(const line of lines){
  const numberOnly=/^\d+(?:\.\d+)*\.$/.test(line.text);
  const captionLabel=line.text.match(/^(?:fig(?:ure)?s?\.?|table|scheme)\s*(?:\d+[a-z]?|[IVXLCDM]+\b)(.*)$/i);
  const isCaption=!!captionLabel&&(!captionLabel[1].trim()||/^[.:]/.test(captionLabel[1])||line.h<bodySize*.96||/^\s+\p{Lu}/u.test(captionLabel[1]));
  const headingLabel=numberOnly||/^\d+(?:\.\d+)*\.?\s+\p{Lu}/u.test(line.text)||/^(?:abstract|introduction|results(?: and discussion)?|conclusions?|references|acknowledg(?:e)?ments?|nomenclature)$/i.test(line.text);
  const isHeading=!isCaption&&(headingLabel||line.h>bodySize*1.2);
  let kind=isCaption?'caption':isHeading?'heading':'body';
  const definitions=!!nomenclature&&line.col===nomenclature.col&&line.y>=nomenclature.y&&line.y<=definitionEnd;
  const valid=!tables.has(line)&&(bodyLines.has(line)||isCaption||isHeading)&&!definitions;
  const gap=previous?Math.abs(line.y-previous.y):0;
  const sameStyle=previous&&Math.abs(line.h-previous.h)<line.h*.15&&lineFont(line)===lineFont(previous);
  const nearEdge=previous&&previous.right>=(columnRight.get(previous.col)||width)-previous.h*5;
  const wrapped=block&&previous&&line.col===previous.col&&gap<=lineStep*1.35&&sameStyle&&line.x<=previous.x+line.h*1.1;
  const captionWrap=block?.kind==='caption'&&(gap<line.h*.3||nearEdge&&line.h<bodySize*.96);
  if(kind==='body'&&wrapped&&block.kind!=='body'&&(captionWrap||!/[.!?。！？]["'”’\])]*$/.test(block.text)||nearEdge&&/^\p{Ll}/u.test(line.text))&&(nearEdge||block.kind==='caption'||/^\d+(?:\.\d+)*\.$/.test(block.text)))kind=block.kind;
  const newBlock=!block||!valid||!previous||kind!==block.kind||headingLabel||isCaption||(isHeading&&!(wrapped&&nearEdge))||line.col!==previous.col||gap>Math.max(Math.max(line.h,previous.h)*1.85,lineStep*1.6)||(line.x>previous.x+line.h*1.1&&sentenceRanges(block.text).at(-1)?.complete)||Math.abs(line.h-previous.h)>line.h*.28;
  if(newBlock)block=null;
  if(!valid){previous=null;continue}
  if(!block){block={text:'',map:[],lines:[],page,kind,id:`p${page}-b${blocks.length}`};blocks.push(block)}
  let lastBox=null;
  for(const b of line.items){
   const raw=b.text;const leading=raw.length-raw.trimStart().length;const value=raw.trim();
   let sep=block.text?' ':'';
   if(touching(lastBox,b))sep='';
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
   sentences.push({id:`p${page}-i${runs[0]?.itemIndex}-${runs[0]?.start}`,page,text,runs,kind:b.kind,blockId:b.id,complete:r.complete,context:b.text,col:first.col,columnIndex:first.columnIndex,columnCount:first.columnCount,
    continuationStart:r.start===0&&first.x<=(columnLeft.get(first.col)??first.x)+bodySize*.6,font:lineFont(first),endFont:lineFont(last),fontSize:first.h,endFontSize:last.h});
  }
 }
 return {page,width,height,gutter,blocks:blocks.map(b=>({id:b.id,text:b.text,kind:b.kind})),sentences,text:items.map(i=>i.str).join(' '),itemCount:items.filter(i=>i.str?.trim()).length};
}
/** A printed hyphen remains in sourceRuns even when removed from logical text.
 * Preserve common scientific compounds; plain-text PDFs cannot disambiguate
 * every hard hyphen. Soft hyphens explicitly mark discretionary word breaks. */
const hardHyphenWords=new Set(('approximately approximate dimension dimensions arrangement arrangements transitional measured measurement measurements measuring suspension suspensions particles particle precipitator precipitators experimental experiment experiments conditions controlled constant concentration concentrations temperature temperatures velocity velocities hydrodynamic hydrodynamics agitation agitator agitators laboratory comparison conventional conventionally calibration calibrated dimensionless dimensional nomenclature observation observations coefficient coefficients simulation simulations turbulent turbulence numerical numerically distribution distributions parameter parameters normalized normalised efficiency efficient material materials erosion sedimentation').split(' '));
function discretionaryHyphen(left,right){
 const word=left.match(/([\p{L}]+)([-\u00ad])$/u);if(!word||!/^\p{L}/u.test(right))return false;
 if(word[2]==='\u00ad')return true;
 if(!/^\p{Ll}/u.test(right))return false;
 const first=word[1].toLowerCase(),second=right.match(/^\p{L}+/u)?.[0].toLowerCase();
 if(/^(?:non|semi|quasi|self|well|ill|two|three|multi)$/i.test(first)||/^(?:scale|based|dimensional|phase|order|state|known|free|like|term|time)$/i.test(second))return false;
 // A literal hard hyphen is ambiguous. Join only a small set of recognizable
 // scientific words; leave unknown compounds intact instead of inventing words.
 return hardHyphenWords.has(first+second);
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
 for(const page of pages){
  const previous=result.at(-1);
  // Restart at the next page's first body column, even if a figure pushes its
  // text below the other column. Captions remain independent indexed units.
  const candidate=previous?.runs.at(-1).page+1===page.page&&!previous.complete?pageContinuation(page,previous):null;
  if(candidate)mergeContinuation(previous,candidate);
  for(const s of page.sentences){
  if(s===candidate)continue;
  const prev=result.at(-1);
  const lastPage=prev?.runs.at(-1).page;
  if(lastPage===s.page&&prev.col!=='full'&&s.col!=='full'&&prev.columnIndex+1===s.columnIndex&&canContinue(prev,s)){
   mergeContinuation(prev,s);
  }else result.push({...s,runs:[...s.runs]});
 }}return result;
}
function canContinue(previous,next){
 return previous&&!previous.complete&&previous.kind==='body'&&next.kind==='body'&&next.continuationStart&&previous.endFont===next.font&&Math.abs(previous.endFontSize-next.fontSize)<next.fontSize*.2;
}
function pageContinuation(page,previous){
 const flows=page.sentences.filter(s=>s.col!=='full'&&s.kind!=='caption'&&s.fontSize>=previous.endFontSize*.85);
 const column=page.gutter?(flows.sort((a,b)=>a.columnIndex-b.columnIndex)[0]?.col??'left'):'full';
 for(const s of page.sentences){
  if(s.col!==column&&!(s.col==='full'&&s.kind==='heading'))continue;
  if(s.kind==='heading')return null;
  if(s.kind==='caption'||s.fontSize<previous.endFontSize*.85)continue;
  return canContinue(previous,s)?s:null;
 }return null;
}
function mergeContinuation(previous,next){
 const hyphen=/\p{L}[-\u00ad]$/u.test(previous.text)&&/^\p{L}/u.test(next.text);
 previous.text=previous.text.slice(0,hyphen&&discretionaryHyphen(previous.text,next.text)?-1:undefined)+(hyphen?'':' ')+next.text;
 previous.runs.push(...next.runs);previous.complete=next.complete;previous.context+=' '+next.context;
 previous.col=next.col;previous.columnIndex=next.columnIndex;previous.columnCount=next.columnCount;
 previous.endFont=next.endFont;previous.endFontSize=next.endFontSize;
}
/** Navigate the logical index; a page continuation belongs to its starting unit. */
export function stepSentence(sentences,id,page,delta){
 if(!sentences.length)return undefined;
 const current=sentences.indexOf(resolveSentenceId(sentences,id));
 if(current>=0)return sentences[Math.max(0,Math.min(sentences.length-1,current+delta))];
 const initial=sentences.findIndex(s=>s.runs.some(r=>r.page>=page));
 return sentences[initial<0?sentences.length-1:initial];
}

/** An ambiguous offset must not silently choose another unit in the same item.
 * @template {{id:string,runs:{page:number,itemIndex:number,start:number,end:number}[]}} T
 * @param {T[]} sentences */
export function sentenceAtOffset(sentences,page,itemIndex,offset){
 if(!Number.isInteger(offset)||offset<0)return undefined;
 const matches=sentences.filter(s=>s.runs.some(r=>r.page===page&&r.itemIndex===itemIndex&&offset>=r.start&&offset<r.end));
 return matches.length===1?matches[0]:undefined;
}

/** Old IDs encode an exact source anchor. If segmentation changes, resolve that
 * anchor in the new index without searching text or rewriting stored records.
 * @template {{id:string,runs:{page:number,itemIndex:number,start:number,end:number}[]}} T
 * @param {T[]} sentences */
export function resolveSentenceId(sentences,id){
 const exact=sentences.find(s=>s.id===id);if(exact)return exact;
 const anchor=typeof id==='string'&&id.match(/^p(\d+)-i(\d+)-(\d+)$/);
 if(!anchor)return undefined;
 const [page,item,offset]=anchor.slice(1).map(Number);
 return [page,item,offset].every(Number.isSafeInteger)?sentenceAtOffset(sentences,page,item,offset):undefined;
}
