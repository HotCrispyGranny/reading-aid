import {useEffect,useRef,useState} from 'react';
import {pdfjs,type PDFDoc} from '../lib/pdf';
import {textGeometry,geometryRect,mergeLineRects,type GeometryRoot} from '../lib/coordinates';
import type {Sentence,Mark,Rect} from '../lib/types';
export function runRects(root:HTMLElement,sentence:Sentence,page:number):Rect[]{
 const spans=Array.from(root.querySelectorAll<HTMLElement>('[data-item]'));const bounds=root.getBoundingClientRect();const scale=Number(root.dataset.scale||1);
 const rects:Rect[]=[];
 for(const run of sentence.runs.filter(r=>r.page===page)){
  const native=geometryRect(root,run.itemIndex,run.start,run.end,page);if(native){if(native.w>0)rects.push(native);continue}
  const span=spans.find(s=>Number(s.dataset.item)===run.itemIndex);if(!span?.firstChild)continue;
  try{const range=document.createRange();range.setStart(span.firstChild,Math.min(run.start,span.textContent?.length||0));range.setEnd(span.firstChild,Math.min(run.end,span.textContent?.length||0));
   for(const r of range.getClientRects())if(r.width>0&&r.height>0)rects.push({page,x:(r.x-bounds.x)/scale,y:(r.y-bounds.y)/scale,w:r.width/scale,h:r.height/scale});
  }catch{/* unsupported glyph remains manually selectable */}
 }return mergeLineRects(rects);
}
export function captureSelection():{text:string;page:number;rects:Rect[]}|null{
 const selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return null;
 const text=selection.toString().trim();if(!text)return null;
 const range=selection.getRangeAt(0);const rects:Rect[]=[];
 for(const root of document.querySelectorAll<HTMLElement>('.pdf-page')){
  if(!root.querySelector('.textLayer')||!range.intersectsNode(root.querySelector('.textLayer')!))continue;
  const bounds=root.getBoundingClientRect(),scale=Number(root.dataset.scale);const page=Number(root.dataset.page);
  for(const span of root.querySelectorAll<HTMLElement>('[data-item]')){
   if(!span.firstChild||!range.intersectsNode(span))continue;
   const start=range.startContainer===span.firstChild?range.startOffset:0;
   const end=range.endContainer===span.firstChild?range.endOffset:(span.textContent?.length||0);
   const native=geometryRect(root,Number(span.dataset.item),start,end,page);
   if(native?.w){rects.push(native);continue}
   const partial=document.createRange();partial.setStart(span.firstChild,start);partial.setEnd(span.firstChild,end);
   for(const r of partial.getClientRects())if(r.width>.1)rects.push({page,x:(r.x-bounds.x)/scale,y:(r.y-bounds.y)/scale,w:r.width/scale,h:r.height/scale});
  }
 }
 return rects.length?{text,page:rects[0].page,rects:mergeLineRects(rects)}:null;
}
type Props={pdf:PDFDoc;page:number;width:number;height:number;scale:number;sentences:Sentence[];active?:Sentence;focus:boolean;dim:number;color:string;border:boolean;marks:Mark[];onSelect:(s:Sentence,analyze:boolean)=>void;onClearFocus:()=>void;onVisible:(page:number)=>void;onReady:()=>void};
export default function PdfPage(p:Props){
 const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),spot=useRef<HTMLCanvasElement>(null),layer=useRef<HTMLDivElement>(null);
 const [near,setNear]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[rects,setRects]=useState<Rect[]>([]);
 const onVisible=useRef(p.onVisible),onReady=useRef(p.onReady);onVisible.current=p.onVisible;onReady.current=p.onReady;
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
  const r=ready&&p.active?runRects(root.current!,p.active,p.page):[];setRects(r);
  const c=spot.current!,base=canvas.current!;if(!c||!base)return;c.width=base.width;c.height=base.height;
  const ctx=c.getContext('2d')!;ctx.clearRect(0,0,c.width,c.height);const ratio=c.width/(p.width*p.scale);
  if(p.focus){for(const box of r){const x=box.x*p.scale*ratio,y=box.y*p.scale*ratio,w=box.w*p.scale*ratio,h=box.h*p.scale*ratio;ctx.drawImage(base,x,y,w,h,x,y,w,h)}}
 },[ready,p.active,p.scale,p.focus,p.width,p.page]);
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
    const bounds=e.currentTarget.getBoundingClientRect(),x=(e.clientX-bounds.left)/p.scale,y=(e.clientY-bounds.top)/p.scale;
    const overMark=p.marks.some(m=>m.rects.some(r=>r.page===p.page&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h));
    if(!overMark)p.onClearFocus();
   }return;
  }
  const index=Number(target.dataset.item);const doc=document as any;const caret=doc.caretPositionFromPoint?.(e.clientX,e.clientY);const range=!caret?doc.caretRangeFromPoint?.(e.clientX,e.clientY):null;let offset=caret?.offset??range?.startOffset??0;
  const g=(root.current as GeometryRoot).pdfGeometry?.[index];if(g&&!g.rotated){const x=(e.clientX-root.current!.getBoundingClientRect().x)/p.scale-g.x;offset=Math.max(0,g.advances.findIndex(v=>v>x)-1);if(x>=g.advances.at(-1)!)offset=g.advances.length-2}
  const candidates=p.sentences.filter(s=>s.runs.some(r=>r.page===p.page&&r.itemIndex===index));
  const s=candidates.find(s=>s.runs.some(r=>r.page===p.page&&r.itemIndex===index&&offset>=r.start&&offset<r.end))||candidates[0];
  if(s)p.onSelect(s,analyze);
 }
 const styleRect=(r:Rect)=>({left:r.x*p.scale,top:r.y*p.scale,width:r.w*p.scale,height:r.h*p.scale});
 return <div ref={root} className="pdf-page" data-page={p.page} data-scale={p.scale} style={{width:p.width*p.scale,height:p.height*p.scale,'--scale-factor':p.scale,'--total-scale-factor':p.scale,'--user-unit':1} as React.CSSProperties} onClick={clicked} onContextMenu={e=>clicked(e,true)}>
  <canvas ref={canvas} className="pdf-canvas" style={{opacity:p.focus&&p.active?1-p.dim:1}}/>
  <div className="mark-layer">{p.marks.flatMap(m=>m.rects.filter(r=>r.page===p.page).map((r,i)=><div key={m.id+'-'+i} className="saved-mark" title="Saved highlight" style={{...styleRect(r),background:m.color}}/>))}</div>
  <canvas ref={spot} className="spot-canvas" style={{width:p.width*p.scale,height:p.height*p.scale}}/>
  {p.focus&&rects.map((r,i)=><div key={i} className="focus-box" style={{...styleRect(r),background:p.color,border:p.border?'1px solid #7d8760':'none'}}/>)}
  <div ref={layer} className="textLayer"/>
  {!ready&&!error&&<div className="page-loading">{near?'Rendering…':'Page '+p.page+''}</div>}
  {error&&<div className="page-loading error">Could not load page: {error}<button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
  <span className="page-tag">{p.page}</span>
 </div>
}
