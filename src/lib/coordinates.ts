import {pdfjs} from './pdf';
import {itemRect} from './highlight-geometry.mjs';
export type ItemGeometry={x:number;y:number;h:number;advances:number[];rotated:boolean};
export type GeometryRoot=HTMLElement&{pdfGeometry?:ItemGeometry[]};
/** Recover font advances from PDF text drawing operators, then reconcile word spacing.
 * PDF.js's invisible generic-font layer is useful for selection, but its partial
 * Range widths can differ from the embedded PDF font. Never use those widths for
 * sentence clipping when native glyph metrics are available. */
const geometryCache=new WeakMap<pdfjs.PDFPageProxy,Promise<ItemGeometry[]>>();
export function textGeometry(page:pdfjs.PDFPageProxy,content:any):Promise<ItemGeometry[]>{
 const cached=geometryCache.get(page);if(cached)return cached;
 const result=computeGeometry(page,content);geometryCache.set(page,result);result.catch(()=>geometryCache.delete(page));return result;
}
async function computeGeometry(page:pdfjs.PDFPageProxy,content:any):Promise<ItemGeometry[]>{
 if(!content.items.length)return [];
 const operators=await page.getOperatorList();const fonts=new Map<string,Map<string,number>>();let font='';
 for(let i=0;i<operators.fnArray.length;i++){
  const fn=operators.fnArray[i],args=operators.argsArray[i];
  if(fn===pdfjs.OPS.setFont){font=args[0];if(!fonts.has(font))fonts.set(font,new Map())}
  if(fn===pdfjs.OPS.showText||fn===pdfjs.OPS.nextLineShowText||fn===pdfjs.OPS.nextLineSetSpacingShowText){
   const glyphs=args.find((a:any)=>Array.isArray(a));if(!glyphs)continue;
   for(const g of glyphs){if(typeof g==='object'&&g?.unicode&&g.width>0){const chars=Array.from(g.unicode as string);for(const ch of chars)fonts.get(font)?.set(ch,g.width/chars.length)}}
  }
 }
 const view=page.getViewport({scale:1});
 return content.items.filter((it:any)=>'str'in it).map((it:any)=>{
  const tx=pdfjs.Util.transform(view.transform,it.transform);const size=Math.hypot(it.transform[0],it.transform[1]);const widths=fonts.get(it.fontName);const chars=Array.from(it.str as string);
  const raw=chars.map(ch=>(widths?.get(ch)|| (ch===' '?250:500))*size/1000);const sum=raw.reduce((a,b)=>a+b,0);const spaces=chars.reduce<number[]>((a,c,i)=>c===' '?[...a,i]:a,[]);
  const residual=it.width-sum;
  if(spaces.length&&Math.abs(residual)<Math.max(it.width*.22,spaces.length*size))for(const i of spaces)raw[i]=Math.max(.05,raw[i]+residual/spaces.length);
  const adjusted=raw.reduce((a,b)=>a+b,0);const factor=adjusted?it.width/adjusted:1;const advances=[0];
  // DOM offsets are UTF-16; preserve surrogate-pair indexing.
  for(let i=0;i<chars.length;i++){const w=raw[i]*factor;if(chars[i].length===2)advances.push(advances.at(-1)!+w/2);advances.push(advances.at(-1)!+w)}
  const h=Math.hypot(tx[2],tx[3]);const style=content.styles[it.fontName];const ascent=style?.ascent||.82;
  return {x:tx[4],y:tx[5]-h*ascent,h:h*1.08,advances,rotated:Math.abs(tx[1])>.05||tx[0]<0};
 });
}
export function geometryRect(root:GeometryRoot,item:number,start:number,end:number,page:number){
 return itemRect(root.pdfGeometry?.[item],start,end,page);
}

export function mergeLineRects<T extends {page:number;x:number;y:number;w:number;h:number}>(rects:T[]):T[]{
 const result:T[]=[];
 for(const r of [...rects].sort((a,b)=>a.page-b.page||a.y-b.y||a.x-b.x)){
  const previous=result.find(p=>p.page===r.page&&Math.abs((p.y+p.h*.7)-(r.y+r.h*.7))<Math.max(p.h,r.h)*.38&&r.x>=p.x&&r.x-p.x-p.w<Math.max(p.h,r.h)*.65);
  if(previous){const right=Math.max(previous.x+previous.w,r.x+r.w),bottom=Math.max(previous.y+previous.h,r.y+r.h);previous.y=Math.min(previous.y,r.y);previous.w=right-previous.x;previous.h=bottom-previous.y}else result.push({...r});
 }return result;
}
