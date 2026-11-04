import type {Sentence,Source,PageData} from './types';
export function buildContext(scope:string,current:Sentence|undefined,sentences:Sentence[],pages:PageData[],question:string,complete:boolean){
 let candidates:Sentence[]=[];let coverage='';
 if(scope==='sentence'){candidates=current?[current]:[];coverage='Current sentence only'}
 else if(scope==='nearby'){const at=sentences.findIndex(s=>s.id===current?.id);candidates=at>=0?sentences.slice(Math.max(0,at-3),at+5):[...(current?[current]:[]),...sentences.filter(s=>s.page===current?.page).slice(0,5)];coverage='Current sentence and nearby context'}
 else {
  // Bounded lexical retrieval; do not imply the model received the whole paper.
  const terms=[...new Set(((question+' '+(current?.text||'')).toLowerCase().match(/[a-z]{3,}/g)||[]).filter(t=>!['the','and','was','were','are','with','for','this','that','from','has','have','which'].includes(t)))];
  const ranked=sentences.map((s,i)=>({s,i,score:terms.reduce((n,t)=>n+(s.text.toLowerCase().includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score);
  const chosen=new Set(ranked.slice(0,35).map(r=>r.s.id));
  for(const p of pages){const first=sentences.find(s=>s.page===p.page);if(first)chosen.add(first.id)}
  if(current)chosen.add(current.id);candidates=sentences.filter(s=>chosen.has(s.id));coverage=`Whole-paper retrieval (${pages.length} pages ${complete?'indexed':', indexing incomplete'}; related excerpts, not the full paper)`;
 }
 const sources:Source[]=[];let size=0;
 for(const s of candidates){if(size+s.text.length>24000)break;size+=s.text.length;sources.push({id:`S${sources.length+1}`,page:s.page,text:s.text,sentenceId:s.id})}
 return {sources,coverage:coverage+(size>=23000?'; context truncated':''),complete};
}
