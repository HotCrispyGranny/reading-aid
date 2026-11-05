import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {loadTypeScript} from './support/load-typescript.mjs';
import {extractPage} from '../src/lib/sentences.mjs';
const coordinates=loadTypeScript(new URL('../src/lib/coordinates.ts',import.meta.url),{'./pdf':{pdfjs}});
const content={items:[{str:'A😀B',fontName:'body',width:30,height:10,transform:[10,0,0,10,40,700]}],styles:{body:{ascent:.8}}};
function page(transform=[1,0,0,-1,0,792]){return {getOperatorList:async()=>({fnArray:[pdfjs.OPS.setFont,pdfjs.OPS.showText],argsArray:[['body',10],[[...'A😀B'].map(unicode=>({unicode,width:1000}))]]}),getViewport:()=>({transform})}}

test('actual glyph geometry preserves UTF-16 offsets without expanding a surrogate pair',async()=>{
 const [g]=await coordinates.textGeometry(page(),content);
 assert.deepEqual(g.advances,[0,10,15,20,30]);
 assert.equal(coordinates.geometryRect({pdfGeometry:[g]},0,3,4,1).w,10);
});

test('viewport user-unit scaling applies once to item width as well as position and height',async()=>{
 const [g]=await coordinates.textGeometry(page([2,0,0,-2,0,1584]),content);
 assert.equal(g.x,80);assert.equal(g.advances.at(-1),60);assert.equal(g.h,21.6);
});

function clickFixture({geometry,caret=null,scale=1,cssScale=1}={}){
 const selections=[],text='First result. Second result.';
 const sentences=extractPage([{str:text,width:280,height:11,transform:[11,0,0,11,40,722]}],612,792,1).sentences;
 const node={nodeType:3,textContent:text,length:text.length};
 const target={dataset:{item:'0'},firstChild:node,textContent:text,contains:n=>n===node,closest:selector=>selector==='[data-item]'?target:null};node.parentElement=target;
 const bounds={x:125,y:200,left:125,top:200,width:612*scale*cssScale,height:792*scale*cssScale};
 const root={pdfGeometry:geometry?[geometry]:[],dataset:{scale:String(scale)},style:{width:612*scale+'px',height:792*scale+'px'},getBoundingClientRect:()=>bounds};
 let ref=0,state=0;const fakeReact={useRef:value=>({current:ref++===0?root:value}),useState:value=>[state++===1?true:value,()=>{}],useEffect:()=>{},useId:()=> 'focus-test',useMemo:fn=>fn()};
 const {default:Page}=loadTypeScript(new URL('../src/components/PdfPage.tsx',import.meta.url),{'react':fakeReact,'../lib/pdf':{pdfjs},'../lib/coordinates':coordinates},{window:{getSelection:()=>({toString:()=>''})},document:{caretPositionFromPoint:()=>caret}});
 const tree=Page({pdf:{},page:1,width:612,height:792,scale,gutter:null,sentences,focus:true,marks:[],onSelect:(s,analyze)=>selections.push({id:s.id,analyze}),onClearFocus:()=>{}});
 const event=(x,y=65)=>({target:target,currentTarget:root,clientX:bounds.left+x*scale*cssScale,clientY:bounds.top+y*scale*cssScale,preventDefault(){this.prevented=true}});
 return {tree,event,selections,sentences,node};
}
const geometry={x:40,y:60,h:12,rotated:false,advances:Array.from({length:29},(_,i)=>i*10)};

test('left/right clicks choose the same partial-item sentence at different zoom and CSS scales',()=>{
 for(const [scale,cssScale]of [[.5,1],[1,1],[2.5,1],[1,2]]){
  const f=clickFixture({geometry,scale,cssScale});
  f.tree.props.onClick(f.event(140));
  f.tree.props.onContextMenu(f.event(210));
  assert.deepEqual(f.selections,[{id:f.sentences[0].id,analyze:false},{id:f.sentences[1].id,analyze:true}]);
 }
});

test('an unresolved or foreign browser caret never silently selects the first sentence',()=>{
 for(const caret of [null,{offset:0,offsetNode:{nodeType:3,textContent:'unrelated'}}]){
  const f=clickFixture({caret});f.tree.props.onClick(f.event(210));assert.deepEqual(f.selections,[]);
 }
});

test('actual PDF font advances clip partial sentences with UserUnit and CropBox transforms',async()=>{
 const {PDFDocument,StandardFonts,PDFName,PDFNumber}=await import('pdf-lib');
 for(const unit of [1,2]){
  const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.TimesRoman),sheet=document.addPage([612,792]);
  if(unit===2){sheet.setCropBox(20,20,572,752);sheet.node.set(PDFName.of('UserUnit'),PDFNumber.of(unit))}
  const text='First WWW result. Second iii result.';sheet.drawText(text,{x:40,y:700,font,size:12});
  const pdf=await pdfjs.getDocument({data:await document.save(),useSystemFonts:true}).promise;
  try{
   const sheet=await pdf.getPage(1),content=await sheet.getTextContent(),view=sheet.getViewport({scale:1}),geometry=await coordinates.textGeometry(sheet,content),items=content.items.filter(it=>'str'in it);
   const {sentences}=extractPage(items,view.width,view.height,1,view.transform);assert.equal(sentences.length,2);
   // drawText emits Tj, not kerning adjustments: sum physical glyph widths.
   const physicalWidth=value=>[...value].reduce((sum,ch)=>sum+font.widthOfTextAtSize(ch,12),0)*unit;
   for(const s of sentences){
    const run=s.runs[0],rect=coordinates.geometryRect({pdfGeometry:geometry},run.itemIndex,run.start,run.end,1);
    const expected=40*unit+view.transform[4]+physicalWidth(text.slice(0,run.start));
    assert.ok(Math.abs(rect.x-expected)<.01);assert.ok(Math.abs(rect.w-physicalWidth(text.slice(run.start,run.end)))<.01);
   }
  }finally{await pdf.destroy()}
 }
});

test('invalid source bounds are rejected rather than clamped onto unrelated characters',()=>{
 for(const [start,end]of [[-1,3],[0,30],[4,2],[.5,2],[NaN,3]])assert.equal(coordinates.geometryRect({pdfGeometry:[geometry]},0,start,end,1),null);
});

test('a valid same-item DOM caret remains available when native geometry is rotated',()=>{
 const caret={offset:18,offsetNode:null};const f=clickFixture({geometry:{...geometry,rotated:true},caret});caret.offsetNode=f.node;
 f.tree.props.onClick(f.event(210));assert.deepEqual(f.selections,[{id:f.sentences[1].id,analyze:false}]);
});

test('zero-width combining marks keep the following glyph at its physical position',async()=>{
 const c={items:[{...content.items[0],str:'A\u0301B',width:20}],styles:content.styles};
 const p=page();p.getOperatorList=async()=>({fnArray:[pdfjs.OPS.setFont,pdfjs.OPS.showText],argsArray:[['body',10],[[{unicode:'A',width:1000},{unicode:'\u0301',width:0},{unicode:'B',width:1000}]]]});
 const [g]=await coordinates.textGeometry(p,c);assert.deepEqual(g.advances,[0,10,10,20]);
});

test('multi-character ligature fallback widths never overwrite known single-glyph metrics',async()=>{
 const c={items:[{...content.items[0],str:'fA',width:13.33}],styles:content.styles};
 const p=page();p.getOperatorList=async()=>({fnArray:[pdfjs.OPS.setFont,pdfjs.OPS.showText],argsArray:[['body',10],[[{unicode:'f',width:333},{unicode:'A',width:1000},{unicode:'fi',width:556}]]]});
 const [g]=await coordinates.textGeometry(p,c);assert.ok(Math.abs(g.advances[1]-3.33)<.0001);assert.ok(Math.abs(g.advances.at(-1)-13.33)<.0001);
});

test('oversized PDF font ascenders no longer put the lower source edge above the baseline',async()=>{
 const c={...content,styles:{body:{ascent:1.1962890625,descent:-.439453125}}};
 const [g]=await coordinates.textGeometry(page(),c),baseline=792-700;
 assert.ok(g.y<baseline-7.5);assert.ok(g.y+g.h>baseline+2.3);
 assert.ok(g.h<=10.8+.00001);assert.deepEqual(g.advances,[0,10,15,20,30]);
});

test('embedded glyph draw codes extend the source frame for actual tall ink without changing advances',async()=>{
 const seen=[],ctx={font:'',measureText(code){seen.push(code);assert.ok(code==='\ue001'||code==='\ue002');return {actualBoundingBoxAscent:code==='\ue001'?850:700,actualBoundingBoxDescent:code==='\ue001'?320:0}}};
 const measured=loadTypeScript(new URL('../src/lib/coordinates.ts',import.meta.url),{'./pdf':{pdfjs}},{document:{createElement:()=>({getContext:()=>ctx})}});
 const face={loadedName:'embedded-test-face',disableFontFace:false},p=page();p.commonObjs={has:()=>true,get:()=>face};
 p.getOperatorList=async()=>({fnArray:[pdfjs.OPS.setFont,pdfjs.OPS.showText],argsArray:[['body',10],[[{unicode:'g',fontChar:'\ue001',width:1000},{unicode:'A',fontChar:'\ue002',width:1000}]]]});
 const c={items:[{...content.items[0],str:'gAg',width:30}],styles:{body:{ascent:1.1962890625,descent:-.439453125}}};
 const [g]=await measured.textGeometry(p,c),baseline=92;
 assert.ok(Math.abs(g.y-(baseline-8.5))<.00001);assert.ok(Math.abs(g.y+g.h-(baseline+3.2))<.00001);
 assert.deepEqual(g.advances,[0,10,20,30]);assert.deepEqual(seen,['\ue001','\ue002']);
});

test('rendered focus borders stay outside selected and neighbouring ink across zoom and pixel ratios',async t=>{
 let canvas;
 try{canvas=await import('@napi-rs/canvas')}catch{t.skip('Optional PDF.js native canvas unavailable');return}
 const {renderToStaticMarkup}=await import('react-dom/server'),{focusRegions}=await import('../src/lib/focus-shape.mjs');
 const source={page:1,x:20,y:25,w:60,h:10},neighbour={page:1,x:80.5,y:25,w:20,h:10};
 for(const scale of [.35,.5,1,1.6,2.5])for(const dpr of [1,2]){
  const shapes=focusRegions([source]),root={pdfGeometry:[{...neighbour,rotated:false,text:'X',advances:[0,neighbour.w]}]};let ref=0,state=0;
  const hooks={useRef:value=>({current:ref++===0?root:value}),useState:value=>[state++===1?true:state===5?shapes:value,()=>{}],useEffect:()=>{},useMemo:fn=>fn(),useId:()=> 'focus-raster'};
  const {default:Page}=loadTypeScript(new URL('../src/components/PdfPage.tsx',import.meta.url),{'react':hooks,'../lib/pdf':{pdfjs},'../lib/coordinates':coordinates});
  const tree=Page({pdf:{},page:1,width:120,height:60,scale,gutter:null,sentences:[],active:{runs:[]},focus:true,dim:.65,border:true,color:'none',marks:[]});
  const svg=tree.props.children.find(child=>child?.type==='svg');assert.ok(svg);
  let markup=renderToStaticMarkup(svg).replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');
  // Rasterize onto a device-pixel grid. The native SVG rasterizer has no CSS/DPR or non-scaling-stroke model;
  // equivalent user-unit widths reproduce the production CSS-sized stroke.
  markup=markup.replace(/^(<svg[^>]*?)width="[^"]+"/,`$1width="${120*scale*dpr}"`).replace(/^(<svg[^>]*?)height="[^"]+"/,`$1height="${60*scale*dpr}"`).replace(/stroke-width="([0-9.]+)"/g,(_match,width)=>`stroke-width="${Number(width)/scale}"`).replaceAll('vector-effect="non-scaling-stroke"','');
  const image=await canvas.loadImage(Buffer.from(markup)),surface=canvas.createCanvas(Math.ceil(120*scale*dpr),Math.ceil(60*scale*dpr)),ctx=surface.getContext('2d');ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,surface.width,surface.height).data,factor=scale*dpr;
  for(const r of [source,neighbour]){
   let checked=0;
   for(let y=Math.ceil(r.y*factor+1);y<(r.y+r.h)*factor-1;y++)for(let x=Math.ceil(r.x*factor+1);x<(r.x+r.w)*factor-1;x++){
    assert.equal(pixels[(y*surface.width+x)*4+3],0,`border crossed ink at zoom ${scale}, DPR ${dpr}, ${x},${y}`);checked++;
   }assert.ok(checked>0);
  }
  assert.ok(pixels.some((value,i)=>i%4===3&&value>0),'The exterior border must remain visible');
 }
});

test('optional glyph measurement failure falls back without preventing PDF geometry',async()=>{
 const ctx={font:'',measureText(){throw Error('font measurement unavailable')}};
 const fallback=loadTypeScript(new URL('../src/lib/coordinates.ts',import.meta.url),{'./pdf':{pdfjs}},{document:{createElement:()=>({getContext:()=>ctx})}});
 const p=page();p.commonObjs={has:()=>true,get:()=>({loadedName:'failed-measurement',disableFontFace:false})};
 p.getOperatorList=async()=>({fnArray:[pdfjs.OPS.setFont,pdfjs.OPS.showText],argsArray:[['body',10],[[{unicode:'A',fontChar:'A',width:1000}]]]});
 const [g]=await fallback.textGeometry(p,{...content,items:[{...content.items[0],str:'A',width:10}]});
 assert.deepEqual(g.advances,[0,10]);assert.ok(g.y+g.h>92);
});
