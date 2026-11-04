// MyMemory is an actual external translation service; no simulated translations.
export function translationChunks(text,maxBytes=480){
 const chunks=[];let current='';
 for(const token of text.match(/\S+\s*/g)||[]){
  if(Buffer.byteLength(token)>maxBytes)throw Error('A text token is too long to translate. Please select a shorter passage.');
  if(current&&Buffer.byteLength(current+token)>maxBytes){chunks.push(current.trim());current=''}current+=token;
 }if(current.trim())chunks.push(current.trim());return chunks;
}
export async function translateText(text,signal){
 const parts=translationChunks(text);const translated=[];
 for(const part of parts){
  const url=new URL('https://api.mymemory.translated.net/get');url.searchParams.set('q',part);url.searchParams.set('langpair','en|zh-CN');
  let response;try{response=await fetch(url,{signal,headers:{Accept:'application/json'}})}catch(e){if(e.name==='AbortError')throw e;throw Error('Translation service could not be reached. Check server network access or use Open in Google Translate below.')}
  if(!response.ok)throw Error(`Translation service returned HTTP ${response.status}. Please try again later.`);
  const result=await response.json();if(Number(result.responseStatus)!==200||result.quotaFinished)throw Error(result.quotaFinished||Number(result.responseStatus)===429?'The free translation quota has been reached. Try later or use Open in Google Translate.':'The translation provider could not translate this text. Please select a shorter passage.');
  const value=result.responseData?.translatedText;if(typeof value!=='string'||!value.trim())throw Error('The translation provider returned no translation.');translated.push(value.trim());
 }
 return {translation:translated.join(' '),provider:'MyMemory',created:Date.now()};
}
