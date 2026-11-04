import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const messages={AI_DISABLED:[403,'Paid AI is restricted. Beta AI is disabled. Reading and translation remain available.'],AI_UNAVAILABLE:[503,'Beta AI is temporarily unavailable. Reading and translation remain available.'],AUTH_REQUIRED:[401,'Enter your beta invite code to use AI.'],SESSION_INVALID:[401,'Your beta session is invalid. Enter your invite code again.'],SESSION_EXPIRED:[401,'Your beta session expired. Enter your invite code again.'],INVALID_INVITE:[401,'The invite code is invalid.'],CSRF_REJECTED:[403,'The request could not be verified. Refresh this page and try again.'],INVALID_REQUEST:[400,'The AI request is malformed or too large. Choose a smaller scope.'],RATE_LIMITED:[429,'Beta AI is rate limited. Please wait a minute and try again.'],BUDGET_EXHAUSTED:[429,'The beta AI budget is exhausted. Reading and translation remain available.'],DUPLICATE_REQUEST:[409,'This AI request was already submitted. Its result may be unavailable; it will not be sent again.']};
export class BetaError extends Error{constructor(code){super(messages[code]?.[1]||messages.AI_UNAVAILABLE[1]);this.code=messages[code]?code:'AI_UNAVAILABLE';this.status=messages[this.code][0]}}
export const production=(env=process.env)=>env.NODE_ENV==='production'||!!env.VERCEL;
export const COOKIE='__Host-judu-beta';
export const SESSION_SECONDS=8*60*60;
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function same(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)}

/** Missing/invalid configuration never becomes an enabled production policy. */
export function betaConfig(env=process.env){
 if(env.AI_BETA_ENABLED!=='true')throw new BetaError('AI_DISABLED');
 try{
  const origin=new URL(env.AI_BETA_ORIGIN),redis=new URL(env.AI_BETA_REDIS_REST_URL);
  if(origin.protocol!=='https:'||origin.origin!==env.AI_BETA_ORIGIN||origin.username||origin.password)throw Error();
  if(redis.protocol!=='https:'||redis.username||redis.password||redis.search||redis.hash)throw Error();
  if(!env.AI_API_KEY||env.AI_MODEL!=='gpt-5-mini'||env.AI_BETA_PRICING_CONFIRMED!=='true'||!env.AI_BETA_REDIS_REST_TOKEN||! /^[A-Za-z0-9_-]{43,128}$/.test(env.AI_BETA_SESSION_SECRET||''))throw Error();
  const invites=JSON.parse(env.AI_BETA_INVITES_JSON);
  if(!invites||Array.isArray(invites)||Object.keys(invites).length<1||Object.keys(invites).length>20||Object.entries(invites).some(([id,hash])=>!/^[-a-zA-Z0-9_]{1,40}$/.test(id)||typeof hash!=='string'||! /^[a-f0-9]{64}$/.test(hash))||new Set(Object.values(invites)).size!==Object.keys(invites).length)throw Error();
  const prices=['AI_INPUT_USD_PER_MILLION','AI_CACHED_INPUT_USD_PER_MILLION','AI_OUTPUT_USD_PER_MILLION'].map(k=>env[k]?.trim()?Number(env[k]):NaN);
  if(prices.some(p=>!Number.isFinite(p)||p<=0||p>1000)||prices[1]>prices[0])throw Error();
  const budget=Number(env.AI_BETA_BUDGET_USD),output=Number(env.AI_MAX_OUTPUT_TOKENS);
  if(!Number.isFinite(budget)||budget<=0||budget>1000||!Number.isInteger(output)||output<256||output>8000)throw Error();
  return {origin:origin.origin,redisURL:redis.href,redisToken:env.AI_BETA_REDIS_REST_TOKEN,secret:env.AI_BETA_SESSION_SECRET,invites,budgetMicros:Math.floor(budget*1e6),pricing:{input:prices[0],cachedInput:prices[1],output:prices[2]},maxOutputTokens:output};
 }catch{throw new BetaError('AI_UNAVAILABLE')}
}
export function requireOrigin(req,config){
 if(req.get('origin')!==config.origin||!/^application\/json(?:\s*;|$)/i.test(req.get('content-type')||'')||req.get('sec-fetch-site')&&req.get('sec-fetch-site')!=='same-origin')throw new BetaError('CSRF_REJECTED');
}
export function issueSession(id,config,now=Date.now()){
 const session={v:1,id,invite:config.invites[id],iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:randomBytes(24).toString('base64url'),csrf:randomBytes(24).toString('base64url')};
 const body=Buffer.from(JSON.stringify(session)).toString('base64url');return `${body}.${createHmac('sha256',config.secret).update(body).digest('base64url')}`;
}
export function sessionCookie(value,maxAge=SESSION_SECONDS){return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`}
export function verifySession(req,config,now=Date.now()){
 const cookies=(req.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));
 if(!cookies.length)throw new BetaError('AUTH_REQUIRED');
 try{
  if(cookies.length!==1)throw Error();
  const token=cookies[0].slice(COOKIE.length+1);if(token.length>2048||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))throw Error();
  const [body,signature]=token.split('.');if(!same(signature,createHmac('sha256',config.secret).update(body).digest('base64url')))throw Error();
  const s=JSON.parse(Buffer.from(body,'base64url').toString());
  if(s.v!==1||typeof s.id!=='string'||!Object.hasOwn(config.invites,s.id)||!same(s.invite,config.invites[s.id])||!Number.isInteger(s.iat)||!Number.isInteger(s.exp)||s.iat>now/1000+30||s.exp-s.iat!==SESSION_SECONDS||! /^[A-Za-z0-9_-]{32}$/.test(s.csrf)||! /^[A-Za-z0-9_-]{32}$/.test(s.nonce))throw Error();
  if(s.exp<=now/1000)throw new BetaError('SESSION_EXPIRED');return s;
 }catch(e){if(e instanceof BetaError)throw e;throw new BetaError('SESSION_INVALID')}
}
export function inviteIdentity(code,config){
 if(typeof code!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(code))throw new BetaError('INVALID_INVITE');
 const hash=digest(code);let found;for(const [id,value]of Object.entries(config.invites))if(same(hash,value))found=id;
 if(!found)throw new BetaError('INVALID_INVITE');return found;
}
