// This object is created by App for this tab. No module-global key, browser
// storage, cookie, URL or document record ever contains the supplied credential.
const validKey=key=>typeof key==='string'&&/^sk-[A-Za-z0-9_-]{16,500}$/.test(key);
export function createTabKey(){
 let value='';
 return {
  set(key){const next=typeof key==='string'?key.trim():'';if(!validKey(next))throw Error('Enter a valid OpenAI API key.');value=next},
  get(){return value},clear(){value=''}
 };
}
export function aiHeaders(mode,csrf,key,requestId,secure){
 const headers={'Content-Type':'application/json','X-Judu-AI-Mode':mode,'X-AI-Request-ID':requestId};
 if(mode==='byok'){
  if(!secure)throw Error('Your OpenAI key can only be sent over HTTPS.');
  if(!validKey(key))throw Error('Enter your own OpenAI API key.');
  if(!csrf)throw Error('Refresh AI access before using your own key.');
  headers.Authorization='Bearer '+key;headers['X-CSRF-Token']=csrf;
 }else if(mode==='owner'){
  if(key)throw Error('Choose one AI billing mode.');
  if(!csrf)throw Error('Owner AI authentication is required.');headers['X-CSRF-Token']=csrf;
 }else if(mode!=='local')throw Error('Choose Owner AI or use your own OpenAI API key.');
 return headers;
}
