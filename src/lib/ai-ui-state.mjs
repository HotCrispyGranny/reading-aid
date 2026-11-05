// Client presentation only. Missing capabilities never grant access.
export function normalizeAIStatus(data){
 const localOnly=data.localOnly===true||!data.owner&&!data.byok;
 return {configured:data.configured===true,localOnly,
  owner:data.owner??{enabled:false,authenticated:false,state:'disabled'},
  byok:localOnly?{enabled:false,state:'local_unavailable'}:data.byok??{enabled:false,state:'unavailable'}};
}

export function aiErrorMessage(error,mode){
 const message=error instanceof Error?error.message:'AI is temporarily unavailable.';
 if(mode==='byok'){
  if(error?.code==='BYOK_KEY_INVALID'||error?.code==='OPENAI_AUTH_FAILED'||/OpenAI authentication failed\. Check the server key\./.test(message))return 'Personal AI: Your OpenAI API key was rejected. Use Manage to replace or remove it; check your OpenAI API billing.';
  return 'Personal AI: '+message;
 }
 return (mode==='owner'?'Owner AI: ':mode==='local'?'Local AI: ':'AI access: ')+message;
}
