import {useState} from 'react';
export type BetaAIStatus={enabled:boolean;authenticated:boolean;state:'disabled'|'unavailable'|'authentication_required'|'session_invalid'|'session_expired'|'authenticated';csrfToken?:string};
export default function BetaAIAccess({status,refresh}:{status:BetaAIStatus;refresh:()=>Promise<void>}){
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(action:'login'|'logout'){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/beta/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(action==='logout'?{'X-CSRF-Token':status.csrfToken||''}:{})},body:JSON.stringify(action==='login'?{code:code.trim()}:{}),cache:'no-store'});
   const data=await response.json();if(!response.ok){if(response.status===401&&action==='logout')await refresh();throw Error(data.error||'Beta AI is temporarily unavailable.')}
   setCode('');await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Beta AI is temporarily unavailable.')}finally{setBusy(false)}
 }
 return <section className="chatgpt-bridge" aria-label="Beta AI access" style={{margin:'10px 14px'}}>
  <strong>Beta AI access</strong>
  {status.state==='disabled'?<p>Beta AI is disabled. Reading and translation remain available.</p>:status.state==='unavailable'?<p>Beta AI is temporarily unavailable. Reading and translation remain available.</p>:status.authenticated?<div className="row"><small>Invite active · server limits apply</small><button disabled={busy} onClick={()=>submit('logout')}>Sign out of AI</button></div>:<details open={status.state==='session_expired'||status.state==='session_invalid'}>
   <summary>Enter an invite code</summary>
   {(status.state==='session_expired'||status.state==='session_invalid')&&<p>Your AI session expired or is no longer valid. Enter your invite code again.</p>}
   <form onSubmit={e=>{e.preventDefault();submit('login')}}>
    <label>Invite code<input type="password" aria-label="Beta invite code" autoComplete="off" spellCheck={false} maxLength={64} value={code} onChange={e=>setCode(e.target.value)}/></label>
    <button className="primary" disabled={busy||!code.trim()}>{busy?'Checking…':'Enable beta AI'}</button>
   </form>
  </details>}
  {error&&<p className="error" role="alert">{error}</p>}
  {(status.state==='disabled'||status.state==='unavailable')&&<button disabled={busy} onClick={async()=>{setBusy(true);try{await refresh()}finally{setBusy(false)}}}>Check AI access</button>}
 </section>;
}
