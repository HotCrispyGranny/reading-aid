import {test} from 'node:test';
import assert from 'node:assert/strict';
import {focusRegions,unselectedRects,focusOutlineClip,focusColumnBounds} from '../src/lib/focus-shape.mjs';

const rect=(x,y,w,h=10,page=1)=>({page,x,y,w,h});
function loops(path){return [...path.matchAll(/M([^Z]+)Z/g)].map(m=>{const n=m[1].split(/[L\s]+/).filter(Boolean).map(Number);return Array.from({length:n.length/2},(_,i)=>[n[i*2],n[i*2+1]])})}
function area(path){return Math.abs(loops(path).reduce((sum,points)=>sum+points.reduce((n,a,i)=>{const b=points[(i+1)%points.length];return n+a[0]*b[1]-b[0]*a[1]},0)/2,0))}
function contains(path,x,y){
 let inside=false;
 for(const points of loops(path))for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}

test('wrapped focus has one exterior boundary and preserves indentation and uneven line lengths',()=>{
 const source=[rect(10,10,100),rect(30,23,60)],before=JSON.stringify(source);
 const [shape]=focusRegions(source);
 assert.equal(loops(shape.path).length,1);assert.equal(area(shape.path),1780);
 assert.ok(contains(shape.path,50,21));
 assert.ok(!contains(shape.path,20,25));assert.ok(!contains(shape.path,100,25));
 for(const r of source)assert.ok(contains(shape.path,r.x+r.w/2,r.y+r.h/2));
 assert.equal(JSON.stringify(source),before);
});

test('same-line runs coalesce without internal run borders or duplicate fill',()=>{
 const [shape]=focusRegions([rect(10,10,40),rect(53,10,30),rect(60,10,20)]);
 assert.equal(loops(shape.path).length,1);assert.equal(loops(shape.path)[0].length,4);
 assert.equal(area(shape.path),730);
});

test('focus never connects across a gutter, even for a narrow column gap',()=>{
 const shapes=focusRegions([rect(10,10,100),rect(115,10,80)],112);
 assert.deepEqual(shapes.map(s=>s.column),['left','right']);
 assert.equal(shapes.reduce((n,s)=>n+area(s.path),0),1800);
 assert.ok(shapes.every(s=>!contains(s.path,112,15)));
});

test('page continuations render independent page-local shapes',()=>{
 const shapes=focusRegions([rect(10,10,100),rect(30,23,60),rect(10,36,80,10,2)]);
 assert.deepEqual(shapes.map(s=>s.page),[1,2]);
 assert.ok(shapes.every(s=>s.pieces.every(r=>r.page===s.page)));
 assert.equal(area(shapes[1].path),800);
});

test('figure-sized gaps remain empty instead of being enclosed by a sentence bounding box',()=>{
 const [shape]=focusRegions([rect(10,10,100),rect(30,200,60)]);
 assert.equal(loops(shape.path).length,2);assert.equal(area(shape.path),1600);
 assert.ok(!contains(shape.path,50,100));
});

test('unrelated text or a caption blocks a connector between nearby selected lines',()=>{
 const source=[rect(10,10,100),rect(30,23,60)],obstacle=rect(40,20,20,3);
 const [shape]=focusRegions(source,null,[obstacle]);
 assert.equal(loops(shape.path).length,2);assert.equal(area(shape.path),1600);
 assert.ok(!contains(shape.path,50,21));
 assert.equal(loops(focusRegions(source,null,[{...obstacle,page:2}])[0].path).length,1);
});

test('partial source items expose only non-selected glyphs as connector obstacles',()=>{
 const geometry=[{x:10,y:20,h:10,rotated:false,advances:[0,2,5,9,12,16,20]}];
 const runs=[{page:1,itemIndex:0,start:2,end:4},{page:2,itemIndex:0,start:0,end:6}];
 assert.deepEqual(unselectedRects(geometry,runs,1),[rect(10,20,5),rect(22,20,8)]);
 assert.deepEqual(unselectedRects(geometry,runs,2),[]);
});

test('overlapping line rectangles form a union, including holes, without filling excluded space',()=>{
 const [shape]=focusRegions([rect(0,0,40,5),rect(0,25,40,5),rect(0,0,5,30),rect(35,0,5,30)]);
 assert.equal(area(shape.path),600);assert.equal(loops(shape.path).length,2);
 assert.ok(!contains(shape.path,20,15));assert.ok(contains(shape.path,2,15));
});

test('corner-only contact preserves disconnected outlines and leaves both empty corners uncovered',()=>{
 const [shape]=focusRegions([rect(0,0,10),rect(10,10,10)]);
 assert.equal(area(shape.path),200);assert.equal(loops(shape.path).length,2);
 assert.ok(!contains(shape.path,5,15));assert.ok(!contains(shape.path,15,5));
});

test('outline coverage equals the union of its pieces for irregular overlapping rectangles',()=>{
 let seed=12345;const random=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n};
 for(let trial=0;trial<20;trial++){
  const rects=Array.from({length:6},()=>rect(random(20),random(20),2+random(10),2+random(10)));
  const [shape]=focusRegions(rects);
  for(let y=.5;y<30;y++)for(let x=.5;x<30;x++){
   const expected=shape.pieces.some(r=>x>r.x&&x<r.x+r.w&&y>r.y&&y<r.y+r.h);
   assert.equal(contains(shape.path,x,y),expected,`coverage at ${x}, ${y}, trial ${trial}`);
  }
 }
});

test('three-column gutters keep focus connectors out of adjacent columns',()=>{
 const rects=[{page:1,x:30,y:70,w:170,h:11},{page:1,x:225,y:70,w:170,h:11},{page:1,x:420,y:70,w:170,h:11}];
 const regions=focusRegions(rects,[212,407]);
 assert.deepEqual(regions.map(r=>r.column),['left','middle','right']);
 assert.ok(regions.every(r=>r.pieces.length===1));
});

test('stroke obstacles leave boundary whitespace free but retain exact neighbouring text offsets',()=>{
 const g={x:10,y:20,h:10,rotated:false,text:'AAA.  BBB.  ',advances:Array.from({length:13},(_,i)=>i*2)};
 const runs=[{page:1,itemIndex:0,start:0,end:4}];
 assert.deepEqual(unselectedRects([g],runs,1),[rect(22,20,8)]);
 const blank={...g,text:'   ',advances:[0,2,4,6]};assert.deepEqual(unselectedRects([blank],[],1),[]);
});

test('the exterior stroke clip excludes selected ink and close neighbours at every zoom',()=>{
 const source=[rect(10,20,80,10),rect(30,33,60,10)],shapes=focusRegions(source),near=rect(90.25,33,20,10),far=rect(130,120,20,10);
 for(const scale of [.35,.5,1,1.6,2.5]){
  const clip=focusOutlineClip(shapes,[near,far],200,160,scale);
  for(const r of source)assert.ok(!contains(clip,r.x+r.w/2,r.y+r.h/2));
  assert.ok(!contains(clip,40,31),'The multi-line connector must have no internal stroke');
  assert.ok(!contains(clip,90.5,37),'Neighbouring ink must clip an encroaching border');
  assert.ok(!contains(clip,50,20-.75/scale),'The raster fringe must remain clear, including the real-PDF low-zoom overhang');
  assert.ok(contains(clip,10-1.5/scale,25),'The exterior border remains available beyond the ink fringe');
  assert.ok(contains(clip,135,125),'Far away obstacles need no clipping computation');
 }
 assert.equal(shapes.length,1);assert.equal(loops(shapes[0].path).length,1);
});

test('exterior strokes retain separate column clips and independent page geometry',()=>{
 assert.deepEqual(focusColumnBounds([100,200],'left',300),{x:0,width:100});
 assert.deepEqual(focusColumnBounds([100,200],'middle',300),{x:100,width:100});
 assert.deepEqual(focusColumnBounds([100,200],'right',300),{x:200,width:100});
 const shapes=focusRegions([rect(10,20,70,10),rect(30,200,50,10)]);
 const clip=focusOutlineClip(shapes,[],300,300,.35);
 assert.ok(contains(clip,50,100));assert.equal(loops(shapes[0].path).length,2);
});
