import {useEffect,useRef,useState} from 'react';
import {ChatCircleText,Copy,ArrowUpRight,Eye} from '@phosphor-icons/react';
import {bridgePresets,buildBridgePrompt} from '../lib/bridge.mjs';
import type {Sentence} from '../lib/types';
type Props={title?:string;fileName:string;current?:Pick<Sentence,'id'|'text'|'page'|'context'>;sentences:Sentence[];complete:boolean};
export default function ChatGPTBridge(p:Props){
 const [preset,setPreset]=useState('simple'),[custom,setCustom]=useState(''),[include,setInclude]=useState(true),[preview,setPreview]=useState(false),[fallback,setFallback]=useState(false),[status,setStatus]=useState(''),[copying,setCopying]=useState(false);
 const area=useRef<HTMLTextAreaElement>(null),version=useRef(0),reserved=useRef<Window|null>(null);
 const prompt=buildBridgePrompt({title:p.title||'',fileName:p.fileName,current:p.current,sentences:p.sentences,complete:p.complete,includeContext:include,preset,customQuestion:custom});
 const oversized=(p.current?.text.length||0)>12000;
 useEffect(()=>{version.current++;setStatus('');setFallback(false);setCopying(false);reserved.current?.close();reserved.current=null;return()=>{version.current++;reserved.current?.close();reserved.current=null}},[prompt]);
 async function copy(open:boolean){
  if(!prompt||oversized)return;const captured=prompt,token=++version.current;setCopying(true);setStatus('');setFallback(false);
  // Reserve a tab during the click to avoid browsers blocking an async popup.
  let popup:Window|null=null;
  if(open){try{popup=window.open('about:blank','_blank');if(popup)popup.opener=null;reserved.current=popup}catch{/* copy still works if a popup is blocked */}}
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(captured);
   if(token!==version.current){popup?.close();return}
   if(open&&popup){popup.location.replace('https://chatgpt.com/');reserved.current=null;setStatus('Prompt copied. Paste it into ChatGPT to continue.')}
   else if(open)setStatus('Prompt copied. The new tab was blocked; use Open ChatGPT below, then paste the prompt.');
   else setStatus('Prompt copied. Paste it into ChatGPT to continue.');
  }catch{
   popup?.close();reserved.current=null;
   if(token!==version.current)return;
   setPreview(true);setFallback(true);setStatus('Clipboard access failed. Select and copy the prompt below, then open ChatGPT and paste it.');
   requestAnimationFrame(()=>{area.current?.focus();area.current?.select()});
  }finally{if(token===version.current)setCopying(false)}
 }
 return <section className="chatgpt-bridge" aria-label="Ask ChatGPT">
  <div className="bridge-heading"><ChatCircleText size={19}/><h3>Ask ChatGPT</h3><span>No API key</span></div>
  <p className="bridge-intro">Create a scientific question from your current sentence. Nothing is sent automatically: review the context, copy it, then paste it into ChatGPT.</p>
  <div className="bridge-presets" aria-label="Question presets">{bridgePresets.map(item=><button key={item.id} type="button" aria-pressed={preset===item.id} className={preset===item.id?'active':''} onClick={()=>setPreset(item.id)}>{item.label}</button>)}</div>
  <label className="bridge-question">Custom Question <textarea aria-label="Custom Question" rows={3} maxLength={4000} value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Optional: your question overrides the selected preset…"/></label>
  <label className="bridge-toggle"><input type="checkbox" checked={include} onChange={e=>setInclude(e.target.checked)}/>Include Surrounding Context</label>
  <p className="bridge-scope">{include?'Up to two sentences before and after, plus the extracted paragraph.':'Only the selected text and document metadata.'} No full PDF, private notes, or conversation history. ChatGPT may require login and has its own usage limits.</p>
  {!p.current&&<p className="bridge-hint">Select a sentence or PDF text to prepare a prompt. Scanned pages need a text layer.</p>}
  {oversized&&<p className="error">Please select a shorter passage (up to 12,000 characters). Your exact selection has not been truncated.</p>}
  <div className="bridge-actions"><button disabled={!prompt||oversized||copying} onClick={()=>copy(false)}><Copy/>{copying?'Copying…':'Copy Prompt'}</button><button className="primary" disabled={!prompt||oversized||copying} onClick={()=>copy(true)}><ArrowUpRight/>Copy &amp; Open ChatGPT</button></div>
  <button className="text-btn" disabled={!prompt} onClick={()=>setPreview(v=>!v)} aria-expanded={preview}><Eye/>{preview?'Hide Context Preview':'Preview Context'}</button>
  {status&&<p className="bridge-status" role="status">{status}</p>}
  {preview&&<div className="bridge-preview"><label htmlFor="bridge-prompt">Context Preview · exact prompt to be copied</label><textarea id="bridge-prompt" aria-label="Context Preview" ref={area} value={prompt} readOnly rows={15}/>{fallback&&<button onClick={()=>{area.current?.focus();area.current?.select()}}>Select prompt for manual copy</button>}</div>}
  <a className="external-translate" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT <ArrowUpRight size={12}/></a>
 </section>
}
