// Server-free hook/handler checks of actual components. No DOM/layout claim.
import {loadTypeScript} from './load-typescript.mjs';
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
export function componentHarness(url,dependencies={},globals={}){
 const slots=[],pending=new Map();let cursor=0,dirty=false;
 const hooks={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{const value=typeof next==='function'?next(slots[i]):next;if(!Object.is(value,slots[i]))dirty=true;slots[i]=value}]},
  useRef(initial){const i=cursor++;return slots[i]??= {current:initial}},
  useId(){return 'harness-'+cursor++},
  useMemo(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={deps,value:fn()};return slots[i].value},
  useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const cleanup=slots[i]?.cleanup;slots[i]={deps,cleanup};pending.set(i,()=>{cleanup?.();slots[i].cleanup=fn()})}},
 };
 const {default:Component}=loadTypeScript(url,{...dependencies,react:hooks},globals);
 return {
  render(props,effects=true){let tree;for(let pass=0;pass<12;pass++){cursor=0;dirty=false;tree=Component(props);if(effects){const work=[...pending.values()];pending.clear();for(const effect of work)effect()}if(!dirty)return tree}throw Error('Unstable hook fixture')},
  unmount(){for(const slot of slots)slot?.cleanup?.();pending.clear()},
 };
}
export function nodes(node){return Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[]}
export function text(node){return node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node)}
