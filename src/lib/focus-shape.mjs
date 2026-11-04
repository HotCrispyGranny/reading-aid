import {itemRect} from './highlight-geometry.mjs';

/** Presentation only: retain the exact source rectangles, then join small empty
 * spaces between adjacent selected runs/lines within the same page and column.
 * A compound union path strokes only the exterior, never each source box.
 * @param {number|null} gutter */
export function focusRegions(rects,gutter=null,obstacles=[]){
 const groups=new Map();
 for(const r of rects){
  if(!(r.w>0&&r.h>0)||![r.x,r.y,r.w,r.h].every(Number.isFinite))continue;
  const column=gutter==null?'full':r.x+r.w<=gutter?'left':r.x>=gutter?'right':'full';
  const key=`${r.page}:${column}`;
  if(!groups.has(key))groups.set(key,{page:r.page,column,rects:[]});
  groups.get(key).rects.push({...r});
 }
 return [...groups.values()].map(group=>{
  const pieces=[...group.rects];
  const blocked=obstacles.filter(r=>r.page===group.page);
  for(let i=0;i<group.rects.length;i++)for(let j=i+1;j<group.rects.length;j++){
   const a=group.rects[i],b=group.rects[j];let bridge=null;
   const left=a.x<=b.x?a:b,right=left===a?b:a;
   const overlapY=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
   const gapX=right.x-left.x-left.w;
   if(overlapY>=Math.min(a.h,b.h)*.65&&gapX>0&&gapX<=Math.max(a.h,b.h)*.65){
    bridge={page:group.page,x:left.x+left.w,y:Math.max(a.y,b.y),w:gapX,h:overlapY};
   }else{
    const upper=a.y<=b.y?a:b,lower=upper===a?b:a;
    const overlapX=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
    const gapY=lower.y-upper.y-upper.h;
    if(overlapX>=Math.min(a.h,b.h)*.5&&gapY>0&&gapY<=Math.max(a.h,b.h)*.65){
     bridge={page:group.page,x:Math.max(a.x,b.x),y:upper.y+upper.h,w:overlapX,h:gapY};
    }
   }
   if(bridge&&!blocked.some(r=>intersects(r,bridge)))pieces.push(bridge);
  }
  return {page:group.page,column:group.column,path:unionOutline(pieces),pieces};
 });
}
function intersects(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}

/** Non-selected portions of physical items protect nearby text from connectors.
 * No normalized-text lookup is involved, including for partial-item sentences. */
export function unselectedRects(geometry,runs,page){
 const rects=[];
 geometry.forEach((g,itemIndex)=>{
  if(!g)return;
  const selected=runs.filter(r=>r.page===page&&r.itemIndex===itemIndex).sort((a,b)=>a.start-b.start);
  let start=0;
  for(const r of [...selected,{start:g.advances.length-1,end:g.advances.length-1}]){
   if(r.start>start){const rect=itemRect(g,start,r.start,page);if(rect?.w)rects.push(rect)}
   start=Math.max(start,r.end);
  }
 });return rects;
}

// Coordinate-compressed rectangle union. Interior edges disappear; disconnected
// pieces and holes remain separate subpaths instead of becoming bounding boxes.
function unionOutline(rects){
 const xs=[...new Set(rects.flatMap(r=>[r.x,r.x+r.w]))].sort((a,b)=>a-b);
 const ys=[...new Set(rects.flatMap(r=>[r.y,r.y+r.h]))].sort((a,b)=>a-b);
 const columns=xs.length-1,rows=ys.length-1,filled=new Uint8Array(columns*rows);
 for(const r of rects){
  const right=xs.indexOf(r.x+r.w),bottom=ys.indexOf(r.y+r.h);
  for(let y=ys.indexOf(r.y);y<bottom;y++)for(let x=xs.indexOf(r.x);x<right;x++)filled[y*columns+x]=1;
 }
 const edges=[],outgoing=new Map();
 const add=(x,y,nx,ny,direction)=>{
  const edge={from:y*xs.length+x,to:ny*xs.length+nx,direction,used:false};edges.push(edge);
  if(!outgoing.has(edge.from))outgoing.set(edge.from,[]);outgoing.get(edge.from).push(edge);
 };
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  if(!filled[y*columns+x])continue;
  if(y===0||!filled[(y-1)*columns+x])add(x,y,x+1,y,0);
  if(x===columns-1||!filled[y*columns+x+1])add(x+1,y,x+1,y+1,1);
  if(y===rows-1||!filled[(y+1)*columns+x])add(x+1,y+1,x,y+1,2);
  if(x===0||!filled[y*columns+x-1])add(x,y+1,x,y,3);
 }
 const paths=[];
 for(const seed of edges){
  if(seed.used)continue;
  const points=[];let edge=seed;
  do{
   edge.used=true;points.push([xs[edge.from%xs.length],ys[Math.floor(edge.from/xs.length)]]);
   if(edge.to===seed.from)break;
   const direction=edge.direction;
   edge=outgoing.get(edge.to).filter(e=>!e.used).sort((a,b)=>[1,0,3,2].indexOf((a.direction-direction+4)%4)-[1,0,3,2].indexOf((b.direction-direction+4)%4))[0];
  }while(edge);
  const corners=points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return !(a[0]===p[0]&&p[0]===b[0]||a[1]===p[1]&&p[1]===b[1])});
  paths.push(corners.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')+' Z');
 }return paths.join(' ');
}
