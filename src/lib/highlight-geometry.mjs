/** Clip original PDF glyph advances using source UTF-16 offsets, never text search.
 * Coordinates remain in PDF viewport units; the renderer applies zoom once. */
export function itemRect(geometry,start,end,page){
 if(!geometry||geometry.rotated||!geometry.advances.length)return null;
 const limit=geometry.advances.length-1;
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>limit)return null;
 const left=geometry.advances[start],right=geometry.advances[end];
 if(![geometry.x,geometry.y,geometry.h,left,right].every(Number.isFinite)||geometry.h<=0||right<left)return null;
 return {page,x:geometry.x+left,y:geometry.y,w:Math.max(0,right-left),h:geometry.h};
}

/** One advance per original UTF-16 boundary, including surrogate pairs. */
export function utf16Advances(text,widths){
 const advances=[0];let index=0;
 for(const ch of text){const start=advances.at(-1),width=widths[index++];for(let unit=1;unit<=ch.length;unit++)advances.push(start+width*unit/ch.length)}
 return advances;
}

/** Convert client coordinates once; CSS scale/zoom and scrolling are already in bounds. */
export function viewportPoint(bounds,width,height,clientX,clientY){
 if(![bounds.left,bounds.top,bounds.width,bounds.height,width,height,clientX,clientY].every(Number.isFinite)||Math.min(bounds.width,bounds.height,width,height)<=0)return null;
 return {x:(clientX-bounds.left)*width/bounds.width,y:(clientY-bounds.top)*height/bounds.height};
}

/** Return a glyph's source offset, never a guessed first/last sentence. */
export function itemOffset(geometry,x,y){
 const rect=geometry&&itemRect(geometry,0,geometry.advances.length-1,0);
 if(!rect||!Number.isFinite(x)||!Number.isFinite(y)||x<rect.x||x>=rect.x+rect.w||y<rect.y-rect.h*.15||y>rect.y+rect.h*1.15)return null;
 const local=x-rect.x,advances=geometry.advances;let lo=0,hi=advances.length-1;
 while(lo+1<hi){const middle=(lo+hi)>>1;if(advances[middle]<=local)lo=middle;else hi=middle}
 return lo;
}
