import {useState} from 'react';
export type BetaAIStatus={enabled:boolean;authenticated:boolean;state:'disabled'|'unavailable'|'authentication_required'|'session_invalid'|'session_expired'|'authenticated';csrfToken?:string};
export type ByokStatus={enabled:boolean;state:'disabled'|'unavailable'|'available';csrfToken?:string};
export type AIMode='owner'|'byok'|'local'|'none';
type Props={status?:BetaAIStatus;byok?:ByokStatus;mode:AIMode;hasKey:boolean;refresh:()=>Promise<void>;setKey:(key:string)=>void;clearKey:()=>void;selectOwner:()=>void;selectByok:()=>void};
export default function BetaAIAccess(p:Props){
 const [code,setCode]=useState(''),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(action:'login'|'logout'){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/beta/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(action==='logout'?{'X-CSRF-Token':p.status?.csrfToken||''}:{})},body:JSON.stringify(action==='login'?{code:code.trim()}:{}),cache:'no-store'});
   const data=await response.json();if(!response.ok){if(response.status===401&&action==='logout')await p.refresh();throw Error(data.error||'Owner AI is temporarily unavailable.')}
   setCode('');await p.refresh();if(action==='login')p.selectOwner();
  }catch(e){setError(e instanceof Error?e.message:'Owner AI is temporarily unavailable.')}finally{setBusy(false)}
 }
 return <section className="chatgpt-bridge" aria-label="AI access" style={{margin:'10px 14px'}}>
  <strong>Owner AI access</strong>
  {p.status?.authenticated?<div className="row"><small>Owner session active · budget protected</small>{p.mode!=='owner'&&<button onClick={p.selectOwner}>Use Owner AI</button>}<button disabled={busy} onClick={()=>submit('logout')}>Sign out of Owner AI</button></div>:p.status?.enabled?<details>
   <summary>Enter the owner access code</summary>
   {(p.status.state==='session_expired'||p.status.state==='session_invalid')&&<p>The owner session expired or is no longer valid.</p>}
   <form onSubmit={e=>{e.preventDefault();submit('login')}}>
    <label>Owner access code<input type="password" aria-label="Owner access code" autoComplete="off" spellCheck={false} maxLength={64} value={code} onChange={e=>setCode(e.target.value)}/></label>
    <button className="primary" disabled={busy||!code.trim()}>{busy?'Checking…':'Enable Owner AI'}</button>
   </form>
  </details>:<p>{p.status?.state==='unavailable'?'Owner AI is temporarily unavailable.':'Owner AI is disabled.'} The public reader and translation remain available.</p>}
  <strong>Use my own OpenAI API key</strong>
  <p>Your API key stays in this browser tab and is sent only when you make an AI request. It is not saved by Judu.</p>
  <p>ChatGPT Plus/Pro subscriptions do not automatically provide OpenAI API credit. API requests are billed to the account that issued your key; failed or timed-out requests may still be charged.</p>
  {!p.byok?.enabled&&<p>{p.byok?.state==='unavailable'?'Personal-key AI is temporarily unavailable.':'Personal-key AI is disabled on this deployment.'}</p>}
  {p.hasKey?<div className="row"><small>Key ready in this tab{p.mode==='byok'?' · selected':''}</small>{p.mode!=='byok'&&<button disabled={!p.byok?.enabled} onClick={p.selectByok}>Use this key</button>}<button onClick={()=>{p.clearKey();setDraft('');setError('')}}>Remove key</button></div>:p.byok?.enabled?<form onSubmit={e=>{
   e.preventDefault();setError('');try{if(window.location.protocol!=='https:')throw Error('Personal API keys require HTTPS.');p.setKey(draft);setDraft('')}catch(error){setError(error instanceof Error?error.message:'Check your key.')}
  }}>
   <label>OpenAI API key<input type="password" aria-label="Your OpenAI API key" autoComplete="off" spellCheck={false} maxLength={503} value={draft} onChange={e=>setDraft(e.target.value)}/></label>
   <button className="primary" disabled={!draft.trim()}>Use key for this tab</button>
  </form>:null}
  {error&&<p className="error" role="alert">{error}</p>}
  <button disabled={busy} onClick={async()=>{setBusy(true);try{await p.refresh()}finally{setBusy(false)}}}>Refresh AI access</button>
 </section>;
}
