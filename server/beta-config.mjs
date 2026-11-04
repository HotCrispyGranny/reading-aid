import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const messages={
 AI_DISABLED:[403,'Paid AI is restricted. Owner AI is disabled. Reading and translation remain available.'],
 AI_UNAVAILABLE:[503,'AI is temporarily unavailable. Reading and translation remain available.'],
 AUTH_REQUIRED:[401,'Authenticate with your owner access code to use owner-funded AI.'],
 SESSION_INVALID:[401,'The owner session is invalid. Enter the owner access code again.'],
 SESSION_EXPIRED:[401,'The owner session expired. Enter the owner access code again.'],
 OWNER_CODE_INVALID:[401,'The owner access code is invalid.'],
 CSRF_REJECTED:[403,'The request could not be verified. Refresh this page and try again.'],
 INVALID_REQUEST:[400,'The AI request is malformed or too large. Choose a smaller scope.'],
 AI_MODE_REQUIRED:[403,'Paid AI is restricted. Choose Owner AI or use your own OpenAI API key.'],
 RATE_LIMITED:[429,'AI is rate limited. Please wait a minute and try again.'],
 BUDGET_EXHAUSTED:[429,'The owner AI budget is exhausted. Reading and translation remain available.'],
 DUPLICATE_REQUEST:[409,'This AI request was already submitted. It will not be sent again.'],
 BYOK_DISABLED:[403,'Use of personal OpenAI API keys is disabled on this deployment.'],
 BYOK_KEY_REQUIRED:[400,'Enter your own OpenAI API key.'],
 BYOK_KEY_INVALID:[401,'Your OpenAI API key is invalid or was rejected by OpenAI. Check your key and API billing.'],
 BYOK_PROVIDER_LIMITED:[429,'OpenAI rate-limited your key or its API quota is exhausted.'],
 BYOK_SESSION_INVALID:[401,'Refresh AI access before using your own key again.']
};
export class BetaError extends Error{constructor(code){const safe=Object.hasOwn(messages,code)?code:'AI_UNAVAILABLE';super(messages[safe][1]);this.code=safe;this.status=messages[safe][0]}}
export const production=(env=process.env)=>env.NODE_ENV==='production'||!!env.VERCEL;
export const COOKIE='__Host-judu-owner';
export const BYOK_COOKIE='__Host-judu-byok';
export const OWNER_ID='owner';
export const SESSION_SECONDS=8*60*60;
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function same(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)}

function commonConfig(env){
 const origin=new URL(env.AI_BETA_ORIGIN),redis=new URL(env.AI_BETA_REDIS_REST_URL);
 if(origin.protocol!=='https:'||origin.origin!==env.AI_BETA_ORIGIN||origin.username||origin.password)throw Error();
 if(redis.protocol!=='https:'||redis.username||redis.password||redis.search||redis.hash)throw Error();
 if(env.AI_MODEL!=='gpt-5-mini'||!env.AI_BETA_REDIS_REST_TOKEN||! /^[A-Za-z0-9_-]{43,128}$/.test(env.AI_BETA_SESSION_SECRET||''))throw Error();
 const output=Number(env.AI_MAX_OUTPUT_TOKENS);if(!Number.isInteger(output)||output<256||output>8000)throw Error();
 return {origin:origin.origin,redisURL:redis.href,redisToken:env.AI_BETA_REDIS_REST_TOKEN,secret:env.AI_BETA_SESSION_SECRET,maxOutputTokens:output};
}
/** The legacy invites JSON is deliberately ignored. Only the fixed owner ID can
 * authenticate to the server-funded policy, even if old friend hashes remain. */
export function betaConfig(env=process.env){
 if(env.AI_BETA_ENABLED!=='true')throw new BetaError('AI_DISABLED');
 try{
  const common=commonConfig(env);
  if(!env.AI_API_KEY||env.AI_BETA_PRICING_CONFIRMED!=='true'||! /^[a-f0-9]{64}$/.test(env.AI_OWNER_CODE_SHA256||''))throw Error();
  const prices=['AI_INPUT_USD_PER_MILLION','AI_CACHED_INPUT_USD_PER_MILLION','AI_OUTPUT_USD_PER_MILLION'].map(k=>env[k]?.trim()?Number(env[k]):NaN);
  if(prices.some(p=>!Number.isFinite(p)||p<=0||p>1000)||prices[1]>prices[0])throw Error();
  const budget=Number(env.AI_BETA_BUDGET_USD);if(!Number.isFinite(budget)||budget<=0||budget>1000||Math.floor(budget*1e6)<1)throw Error();
  return {...common,apiKey:env.AI_API_KEY,invites:{[OWNER_ID]:env.AI_OWNER_CODE_SHA256},budgetMicros:Math.floor(budget*1e6),pricing:{input:prices[0],cachedInput:prices[1],output:prices[2]}};
 }catch{throw new BetaError('AI_UNAVAILABLE')}
}
/** No AI_API_KEY, owner hash, owner budget or owner pricing acknowledgement is
 * read or required here. Redis is used only for independent BYOK abuse limits. */
export function byokConfig(env=process.env){
 if(env.AI_BYOK_ENABLED!=='true')throw new BetaError('BYOK_DISABLED');
 try{return commonConfig(env)}catch{throw new BetaError('AI_UNAVAILABLE')}
}
export function requireOrigin(req,config){
 if(req.get('origin')!==config.origin||!/^application\/json(?:\s*;|$)/i.test(req.get('content-type')||'')||req.get('sec-fetch-site')&&req.get('sec-fetch-site')!=='same-origin')throw new BetaError('CSRF_REJECTED');
}
function sign(payload,config){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');return `${body}.${createHmac('sha256',config.secret).update(body).digest('base64url')}`}
function baseSession(now){return {v:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:randomBytes(24).toString('base64url'),csrf:randomBytes(24).toString('base64url')}}
export function issueSession(id,config,now=Date.now()){
 if(id!==OWNER_ID)throw new BetaError('SESSION_INVALID');
 return sign({...baseSession(now),role:'owner',id:OWNER_ID,invite:config.invites[OWNER_ID]},config);
}
export function issueByokSession(config,now=Date.now()){return sign({...baseSession(now),role:'byok',id:randomBytes(24).toString('base64url')},config)}
export function sessionCookie(value,maxAge=SESSION_SECONDS,name=COOKIE){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`}
function readSession(req,config,cookie,now){
 const cookies=(req.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookie+'='));
 if(!cookies.length)throw new BetaError('AUTH_REQUIRED');
 if(cookies.length!==1)throw Error();
 const token=cookies[0].slice(cookie.length+1);if(token.length>2048||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))throw Error();
 const [body,signature]=token.split('.');if(!same(signature,createHmac('sha256',config.secret).update(body).digest('base64url')))throw Error();
 const s=JSON.parse(Buffer.from(body,'base64url').toString());
 if(s.v!==1||!Number.isInteger(s.iat)||!Number.isInteger(s.exp)||s.iat>now/1000+30||s.exp-s.iat!==SESSION_SECONDS||! /^[A-Za-z0-9_-]{32}$/.test(s.csrf)||! /^[A-Za-z0-9_-]{32}$/.test(s.nonce))throw Error();
 if(s.exp<=now/1000)throw new BetaError('SESSION_EXPIRED');return s;
}
export function verifySession(req,config,now=Date.now()){
 try{const s=readSession(req,config,COOKIE,now);if(s.role!=='owner'||s.id!==OWNER_ID||!same(s.invite,config.invites[OWNER_ID]))throw Error();return s}
 catch(e){if(e instanceof BetaError)throw e;throw new BetaError('SESSION_INVALID')}
}
export function verifyByokSession(req,config,now=Date.now()){
 try{const s=readSession(req,config,BYOK_COOKIE,now);if(s.role!=='byok'||! /^[A-Za-z0-9_-]{32}$/.test(s.id))throw Error();return s}
 catch{throw new BetaError('BYOK_SESSION_INVALID')}
}
export function ownerIdentity(code,config){
 if(typeof code!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(code)||!same(digest(code),config.invites[OWNER_ID]))throw new BetaError('OWNER_CODE_INVALID');return OWNER_ID;
}
