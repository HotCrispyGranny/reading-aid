import {pdfjs} from './pdf';
import {itemRect,utf16Advances} from './highlight-geometry.mjs';
export type ItemGeometry={x:number;y:number;h:number;advances:number[];rotated:boolean;text?:string};
export type GeometryRoot=HTMLElement&{pdfGeometry?:ItemGeometry[]};
/** Recover font advances from PDF text drawing operators, then reconcile word spacing.
 * PDF.js's invisible generic-font layer is useful for selection, but its partial
 * Range widths can differ from the embedded PDF font. Never use those widths for
 * sentence clipping when native glyph metrics are available. */
const geometryCache=new WeakMap<pdfjs.PDFPageProxy,Promise<ItemGeometry[]>>();
const glyphInkCache=new WeakMap<object,Map<string,TextMetrics>>();
export function textGeometry(page:pdfjs.PDFPageProxy,content:any):Promise<ItemGeometry[]>{
 const cached=geometryCache.get(page);if(cached)return cached;
 const result=computeGeometry(page,content);geometryCache.set(page,result);result.catch(()=>geometryCache.delete(page));return result;
}
async function computeGeometry(page:pdfjs.PDFPageProxy,content:any):Promise<ItemGeometry[]>{
 if(!content.items.length)return [];
 const operators=await page.getOperatorList();const fonts=new Map<string,Map<string,number>>();
 const ink=new Map<string,Map<string,{ascent:number;descent:number}>>(),measured=new Map<string,Map<string,TextMetrics>>();let font='';
 let context:CanvasRenderingContext2D|null=null;
 try{if(typeof document!=='undefined'&&document.createElement)context=document.createElement('canvas').getContext('2d')}catch{/* Font-metric bounds remain available without a canvas. */}
 for(let i=0;i<operators.fnArray.length;i++){
  const fn=operators.fnArray[i],args=operators.argsArray[i];
  if(fn===pdfjs.OPS.setFont){
   font=args[0];if(!fonts.has(font)){fonts.set(font,new Map());ink.set(font,new Map());measured.set(font,new Map())}
   // Use the embedded face and the glyph's draw code, not its Unicode text:
   // subset fonts often draw private-use characters for ordinary Latin text.
   const face=page.commonObjs?.has(font)?page.commonObjs.get(font):null;
   if(context&&face?.loadedName&&!face.disableFontFace&&!face.isType3Font){
    context.font=`${face.italic?'italic':'normal'} ${face.black?'900':face.bold?'bold':'normal'} 1000px ${face.systemFontInfo?.css??'"'+face.loadedName+'"'}`;
    let cache=glyphInkCache.get(face);if(!cache){cache=new Map();glyphInkCache.set(face,cache)}measured.set(font,cache);
   }
  }
  if(fn===pdfjs.OPS.showText||fn===pdfjs.OPS.nextLineShowText||fn===pdfjs.OPS.nextLineSetSpacingShowText){
   const glyphs=args.find((a:any)=>Array.isArray(a));if(!glyphs)continue;
   for(const g of glyphs){if(typeof g==='object'&&g?.unicode&&g.width>=0){
    const chars=Array.from(g.unicode as string),widths=fonts.get(font);
    for(const ch of chars)if(chars.length===1||!widths?.has(ch))widths?.set(ch,g.width/chars.length);
    const face=page.commonObjs?.has(font)?page.commonObjs.get(font):null;
    if(context&&face?.loadedName&&!face.disableFontFace&&!face.isType3Font&&g.fontChar&&!g.accent&&!g.isSpace){
     let metrics=measured.get(font)?.get(g.fontChar);
     if(!metrics){try{metrics=context.measureText(g.fontChar)}catch{continue}measured.get(font)?.set(g.fontChar,metrics)}
     const {actualBoundingBoxAscent:a,actualBoundingBoxDescent:d}=metrics;
     if(Number.isFinite(a)&&Number.isFinite(d)&&a+d>0)for(const ch of chars){
      const prior=ink.get(font)?.get(ch);
      ink.get(font)?.set(ch,{ascent:Math.max(prior?.ascent??0,a/1000),descent:Math.max(prior?.descent??0,d/1000)});
     }
    }
   }}
  }
 }
 const view=page.getViewport({scale:1}),unitScale=Math.hypot(view.transform[0],view.transform[1]);
 return content.items.filter((it:any)=>'str'in it).map((it:any)=>{
  const tx=pdfjs.Util.transform(view.transform,it.transform);const size=Math.hypot(it.transform[0],it.transform[1])*unitScale;const widths=fonts.get(it.fontName);const chars=Array.from(it.str as string),width=it.width*unitScale;
  const raw=chars.map(ch=>(widths?.get(ch)??(ch===' '?250:500))*size/1000);const sum=raw.reduce((a,b)=>a+b,0);const spaces=chars.reduce<number[]>((a,c,i)=>c===' '?[...a,i]:a,[]);
  const residual=width-sum;
  if(spaces.length&&Math.abs(residual)<Math.max(width*.22,spaces.length*size))for(const i of spaces)raw[i]=Math.max(.05,raw[i]+residual/spaces.length);
  const adjusted=raw.reduce((a,b)=>a+b,0);const factor=adjusted?width/adjusted:1;
  const advances=utf16Advances(it.str,raw.map(w=>w*factor));
  const h=Math.hypot(tx[2],tx[3]),style=content.styles[it.fontName];
  const ascent=Number.isFinite(style?.ascent)&&style.ascent>0?style.ascent:.82;
  const descent=Number.isFinite(style?.descent)&&style.descent<0?-style.descent:Math.max(.2,1.08-ascent);
  // PDF.js font metrics may describe a much taller font-wide box than one em.
  // Fit that ratio to the source text's line box, then extend it for measured
  // glyph ink. Never anchor a fixed-height box above the reported ascent alone.
  const normalization=Math.max(1,(ascent+descent)/1.08);
  let above=ascent/normalization,below=descent/normalization;
  for(const ch of chars){const bounds=ink.get(it.fontName)?.get(ch);if(bounds){above=Math.max(above,bounds.ascent);below=Math.max(below,bounds.descent)}}
  return {x:tx[4],y:tx[5]-h*above,h:h*(above+below),advances,text:it.str,rotated:Math.abs(tx[1])>.05||tx[0]<0||!!style?.vertical};
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
