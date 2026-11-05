import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {pdfjs,type PDFDoc} from '../lib/pdf';
import {textGeometry,geometryRect,mergeLineRects,type GeometryRoot} from '../lib/coordinates';
import {focusRegions,unselectedRects,focusColumnBounds,focusOutlineClip,FOCUS_OUTLINE_STROKE} from '../lib/focus-shape.mjs';
import {itemOffset,viewportPoint} from '../lib/highlight-geometry.mjs';
import {sentenceAtOffset} from '../lib/sentences.mjs';
import type {Sentence,Mark,Rect} from '../lib/types';
function sourceRect(root:HTMLElement,bounds:DOMRect,r:DOMRect,page:number):Rect|null{
 const scale=Number(root.dataset.scale||1),width=parseFloat(root.style.width)/scale,height=parseFloat(root.style.height)/scale;
 const start=viewportPoint(bounds,width,height,r.left,r.top),end=viewportPoint(bounds,width,height,r.right,r.bottom);
 return start&&end?{page,x:start.x,y:start.y,w:end.x-start.x,h:end.y-start.y}:null;
}
export function runRects(root:HTMLElement,sentence:Sentence,page:number):Rect[]{
 const spans=Array.from(root.querySelectorAll<HTMLElement>('[data-item]'));const bounds=root.getBoundingClientRect();
 const rects:Rect[]=[];
 for(const run of sentence.runs.filter(r=>r.page===page)){
  const native=geometryRect(root,run.itemIndex,run.start,run.end,page);if(native){if(native.w>0)rects.push(native);continue}
  const span=spans.find(s=>Number(s.dataset.item)===run.itemIndex);if(!span?.firstChild)continue;
  if(!Number.isInteger(run.start)||!Number.isInteger(run.end)||run.start<0||run.end>span.textContent!.length||run.start>=run.end)continue;
  try{const range=document.createRange();range.setStart(span.firstChild,run.start);range.setEnd(span.firstChild,run.end);
   for(const r of range.getClientRects())if(r.width>0&&r.height>0){const box=sourceRect(root,bounds,r,page);if(box)rects.push(box)}
  }catch{/* unsupported glyph remains manually selectable */}
 }return mergeLineRects(rects);
}
export function captureSelection():{text:string;page:number;rects:Rect[]}|null{
 const selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return null;
 const text=selection.toString().trim();if(!text)return null;
 const range=selection.getRangeAt(0);const rects:Rect[]=[];
 for(const root of document.querySelectorAll<HTMLElement>('.pdf-page')){
  if(!root.querySelector('.textLayer')||!range.intersectsNode(root.querySelector('.textLayer')!))continue;
  const bounds=root.getBoundingClientRect();const page=Number(root.dataset.page);
  for(const span of root.querySelectorAll<HTMLElement>('[data-item]')){
   if(!span.firstChild||!range.intersectsNode(span))continue;
   const start=range.startContainer===span.firstChild?range.startOffset:0;
   const end=range.endContainer===span.firstChild?range.endOffset:(span.textContent?.length||0);
   const native=geometryRect(root,Number(span.dataset.item),start,end,page);
   if(native?.w){rects.push(native);continue}
   const partial=document.createRange();partial.setStart(span.firstChild,start);partial.setEnd(span.firstChild,end);
   for(const r of partial.getClientRects())if(r.width>.1){const box=sourceRect(root,bounds,r,page);if(box)rects.push(box)}
  }
 }
 return rects.length?{text,page:rects[0].page,rects:mergeLineRects(rects)}:null;
}
type Props={pdf:PDFDoc;page:number;width:number;height:number;scale:number;gutter:number|number[]|null;sentences:Sentence[];active?:Sentence;focus:boolean;dim:number;color:string;border:boolean;marks:Mark[];onSelect:(s:Sentence,analyze:boolean)=>void;onClearFocus:()=>void;onVisible:(page:number)=>void;onReady:()=>void};
export default function PdfPage(p:Props){
 const outlineId=useId();
 const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),spot=useRef<HTMLCanvasElement>(null),layer=useRef<HTMLDivElement>(null);
 const [near,setNear]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[shapes,setShapes]=useState<{page:number;column:string;path:string;pieces:Rect[]}[]>([]);
 const onVisible=useRef(p.onVisible),onReady=useRef(p.onReady);onVisible.current=p.onVisible;onReady.current=p.onReady;
 const obstacles=useMemo(()=>ready&&p.active?unselectedRects((root.current as GeometryRoot|null)?.pdfGeometry||[],p.active.runs,p.page):[],[ready,p.active,p.page]);
 const outlineClip=useMemo(()=>p.border&&shapes.length?focusOutlineClip(shapes,obstacles,p.width,p.height,p.scale):'',[p.border,shapes,obstacles,p.width,p.height,p.scale]);
 useEffect(()=>{const node=root.current!;const observer=new IntersectionObserver(entries=>{for(const e of entries){setNear(e.isIntersecting)}},{rootMargin:'900px 0px'});observer.observe(node);
  const visible=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)onVisible.current(p.page)},{threshold:.15});visible.observe(node);return()=>{observer.disconnect();visible.disconnect()}},[p.page]);
 useEffect(()=>{
  if(!near){if(canvas.current)canvas.current.width=0;if(spot.current)spot.current.width=0;return}let dead=false;let render:any,text:any;setReady(false);setError('');
  (async()=>{try{
   const page=await p.pdf.getPage(p.page);if(dead)return;const viewport=page.getViewport({scale:p.scale});const ratio=Math.min(window.devicePixelRatio||1,2);const c=canvas.current!;
   c.width=Math.ceil(viewport.width*ratio);c.height=Math.ceil(viewport.height*ratio);c.style.width=`${viewport.width}px`;c.style.height=`${viewport.height}px`;
   render=page.render({canvas:c,viewport,transform:[ratio,0,0,ratio,0,0]});await render.promise;if(dead)return;
   const content=await page.getTextContent();const geometry=await textGeometry(page,content);if(dead)return;(root.current as GeometryRoot).pdfGeometry=geometry;layer.current!.replaceChildren();
   text=new pdfjs.TextLayer({textContentSource:content,container:layer.current!,viewport});await text.render();if(dead)return;
   text.textDivs.forEach((div:HTMLElement,index:number)=>div.dataset.item=String(index));
   setReady(true);onReady.current();
  }catch(e:any){if(!dead&&e.name!=='RenderingCancelledException'&&e.name!=='AbortException')setError(e.message||'Page rendering failed')}})();
  return()=>{dead=true;render?.cancel();text?.cancel();layer.current?.replaceChildren();setReady(false)};
 },[near,p.pdf,p.page,p.scale,retry]);
 useEffect(()=>{
  const r=ready&&p.active?runRects(root.current!,p.active,p.page):[];
  setShapes(focusRegions(r,p.gutter,obstacles));
  const c=spot.current!,base=canvas.current!;if(!c||!base)return;c.width=base.width;c.height=base.height;
  const ctx=c.getContext('2d')!;ctx.clearRect(0,0,c.width,c.height);const ratio=c.width/(p.width*p.scale);
  if(p.focus){for(const box of r){const x=box.x*p.scale*ratio,y=box.y*p.scale*ratio,w=box.w*p.scale*ratio,h=box.h*p.scale*ratio;ctx.drawImage(base,x,y,w,h,x,y,w,h)}}
 },[ready,p.active,p.scale,p.focus,p.width,p.page,p.gutter,obstacles]);
 function clicked(e:React.MouseEvent,analyze=false){
  if(!ready||(!analyze&&window.getSelection()?.toString().length))return;
  if(analyze)e.preventDefault();
  const element=e.target as HTMLElement;
  if(element.closest('a,button,input,textarea,select,[role="button"],[contenteditable],.saved-mark,.mark-layer,.page-loading'))return;
  const target=element.closest<HTMLElement>('[data-item]');
  if(!target){
   if(!analyze&&p.focus&&p.active&&(element===e.currentTarget||element.matches('.textLayer,.pdf-canvas'))){
    // Saved overlays ignore pointer events, so protect their bounds even when
    // the click falls through to the page background underneath them.
    const point=viewportPoint(e.currentTarget.getBoundingClientRect(),p.width,p.height,e.clientX,e.clientY);if(!point)return;
    const {x,y}=point;
    const overMark=p.marks.some(m=>m.rects.some(r=>r.page===p.page&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h));
    if(!overMark)p.onClearFocus();
   }return;
  }
  const index=Number(target.dataset.item),point=viewportPoint(root.current!.getBoundingClientRect(),p.width,p.height,e.clientX,e.clientY);if(!point)return;
  const g=(root.current as GeometryRoot).pdfGeometry?.[index];let offset=itemOffset(g,point.x,point.y);
  if(offset===null){
   const doc=document as any,caret=doc.caretPositionFromPoint?.(e.clientX,e.clientY),range=!caret?doc.caretRangeFromPoint?.(e.clientX,e.clientY):null;
   const node=caret?.offsetNode??range?.startContainer,value=caret?.offset??range?.startOffset;
   // Browser carets may resolve to an adjacent span or container. Accept only
   // this item's text node; unresolved clicks must not select its first unit.
   if(node===target.firstChild&&node?.nodeType===3&&Number.isInteger(value)&&value>=0&&value<=node.textContent.length&&node.textContent.length)offset=Math.min(value,node.textContent.length-1);
  }
  const s=sentenceAtOffset(p.sentences,p.page,index,offset);
  if(s)p.onSelect(s,analyze);
 }
 const styleRect=(r:Rect)=>({left:r.x*p.scale,top:r.y*p.scale,width:r.w*p.scale,height:r.h*p.scale});
 return <div ref={root} className="pdf-page" data-page={p.page} data-scale={p.scale} style={{width:p.width*p.scale,height:p.height*p.scale,'--scale-factor':p.scale,'--total-scale-factor':p.scale,'--user-unit':1} as React.CSSProperties} onClick={clicked} onContextMenu={e=>clicked(e,true)}>
  <canvas ref={canvas} className="pdf-canvas" style={{opacity:p.focus&&p.active?1-p.dim:1}}/>
  <div className="mark-layer">{p.marks.flatMap(m=>m.rects.filter(r=>r.page===p.page).map((r,i)=><div key={m.id+'-'+i} className="saved-mark" title="Saved highlight" style={{...styleRect(r),background:m.color}}/>))}</div>
  <canvas ref={spot} className="spot-canvas" style={{width:p.width*p.scale,height:p.height*p.scale}}/>
  {p.focus&&shapes.length>0&&<svg className="sentence-focus" aria-hidden="true" width={p.width*p.scale} height={p.height*p.scale} viewBox={`0 0 ${p.width} ${p.height}`} style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:4,mixBlendMode:'multiply'}}>
   <defs>
    {p.border&&<clipPath id={outlineId}><path d={outlineClip} clipRule="evenodd"/></clipPath>}
    {shapes.map(shape=>{const bounds=focusColumnBounds(p.gutter,shape.column,p.width);return <clipPath key={shape.column} id={outlineId+'-'+shape.column}><rect x={bounds.x} y={0} width={bounds.width} height={p.height}/></clipPath>})}
   </defs>
   {shapes.map(shape=><g key={shape.page+'-'+shape.column} clipPath={`url(#${outlineId}-${shape.column})`}>
    <path className="focus-shape" d={shape.path} fill={p.color} fillRule="evenodd"/>
    {p.border&&<path className="focus-outline" d={shape.path} fill="none" stroke="#7d8760" strokeWidth={FOCUS_OUTLINE_STROKE} strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${outlineId})`}/>}
   </g>)}
  </svg>}
  <div ref={layer} className="textLayer"/>
  {!ready&&!error&&<div className="page-loading">{near?'Rendering…':'Page '+p.page+''}</div>}
  {error&&<div className="page-loading error">Could not load page: {error}<button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
  <span className="page-tag">{p.page}</span>
 </div>
}
