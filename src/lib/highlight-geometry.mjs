/** Clip original PDF glyph advances using source UTF-16 offsets, never text search.
 * Coordinates remain in PDF viewport units; the renderer applies zoom once. */
export function itemRect(geometry,start,end,page){
 if(!geometry||geometry.rotated||!geometry.advances.length)return null;
 const limit=geometry.advances.length-1;
 const left=geometry.advances[Math.max(0,Math.min(start,limit))]||0;
 const right=geometry.advances[Math.max(0,Math.min(end,limit))]||0;
 return {page,x:geometry.x+left,y:geometry.y,w:Math.max(0,right-left),h:geometry.h};
}
