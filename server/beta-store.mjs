import {BetaError} from './beta-config.mjs';
export const PREFIX='judu:{beta-v1}:';
export const BUDGET_KEY=PREFIX+'budget';
export const INVITES_KEY=PREFIX+'invites';
export const AUTHORIZE=`if redis.call('HGET',KEYS[1],ARGV[1])~=ARGV[2] then return 'SESSION_INVALID' end; return 'OK'`;
// Fixed-window limits: 5/invite/minute, 20/global/minute; 1/invite and 3/global
// concurrent leases. Budget and reservation records never expire automatically.
export const READY=`local s=tonumber(redis.call('HGET',KEYS[1],'spent')); local r=tonumber(redis.call('HGET',KEYS[1],'reserved')); local cap=tonumber(redis.call('HGET',KEYS[1],'limit')); if not s or not r or not cap or s<0 or r<0 or cap<=0 or redis.call('HGET',KEYS[1],'blocked')=='1' then return 'AI_UNAVAILABLE' end; return 'OK'`;
export const ATTEMPT=`
local s=tonumber(redis.call('HGET',KEYS[1],'spent')); local r=tonumber(redis.call('HGET',KEYS[1],'reserved')); local cap=tonumber(redis.call('HGET',KEYS[1],'limit'));
if not s or not r or not cap or s<0 or r<0 or cap<=0 or redis.call('HGET',KEYS[1],'blocked')=='1' then return 'AI_UNAVAILABLE' end
local ip=tonumber(redis.call('GET',KEYS[2]) or '0'); local all=tonumber(redis.call('GET',KEYS[3]) or '0');
if ip>=5 or all>=30 then return 'RATE_LIMITED' end
redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],120); redis.call('INCR',KEYS[3]); redis.call('EXPIRE',KEYS[3],120); return 'OK'`;
export const RESERVE=`
if redis.call('HGET',KEYS[7],ARGV[4])~=ARGV[5] then return 'SESSION_INVALID' end
if redis.call('EXISTS',KEYS[6])==1 then return 'DUPLICATE_REQUEST' end
local s=tonumber(redis.call('HGET',KEYS[1],'spent')); local r=tonumber(redis.call('HGET',KEYS[1],'reserved')); local limit=tonumber(redis.call('HGET',KEYS[1],'limit'));
if not s or not r or not limit or s<0 or r<0 or limit<=0 or redis.call('HGET',KEYS[1],'blocked')=='1' then return 'AI_UNAVAILABLE' end
local amount=tonumber(ARGV[1]); local cap=math.min(tonumber(ARGV[2]),limit); local now=tonumber(ARGV[3]);
if s+r+amount>cap then return 'BUDGET_EXHAUSTED' end
if tonumber(redis.call('GET',KEYS[2]) or '0')>=5 or tonumber(redis.call('GET',KEYS[3]) or '0')>=20 then return 'RATE_LIMITED' end
redis.call('ZREMRANGEBYSCORE',KEYS[4],'-inf',now-120000); redis.call('ZREMRANGEBYSCORE',KEYS[5],'-inf',now-120000);
if redis.call('ZCARD',KEYS[4])>=3 or redis.call('ZCARD',KEYS[5])>=1 then return 'RATE_LIMITED' end
redis.call('HINCRBY',KEYS[1],'reserved',amount);
redis.call('HSET',KEYS[6],'state','held','amount',amount,'created',now);
redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],120); redis.call('INCR',KEYS[3]); redis.call('EXPIRE',KEYS[3],120);
redis.call('ZADD',KEYS[4],now,KEYS[6]); redis.call('ZADD',KEYS[5],now,KEYS[6]); return 'OK'`;
export const FINISH=`
local state=redis.call('HGET',KEYS[4],'state');
if state~='held' then return 'OK' end
local amount=tonumber(redis.call('HGET',KEYS[4],'amount'));
local s=tonumber(redis.call('HGET',KEYS[1],'spent')); local r=tonumber(redis.call('HGET',KEYS[1],'reserved'));
if not amount or not s or not r or r<amount then return 'AI_UNAVAILABLE' end
if ARGV[1]=='settled' then
 redis.call('HINCRBY',KEYS[1],'spent',ARGV[2]); redis.call('HINCRBY',KEYS[1],'reserved',-amount);
 if tonumber(ARGV[2])>amount then redis.call('HSET',KEYS[1],'blocked','1') end
 redis.call('HSET',KEYS[4],'state','settled','actual',ARGV[2],'input',ARGV[3],'output',ARGV[4],'cached',ARGV[5]);
else redis.call('HSET',KEYS[4],'state','unknown') end
redis.call('ZREM',KEYS[2],KEYS[4]); redis.call('ZREM',KEYS[3],KEYS[4]); return 'OK'`;

export class RedisBetaStore{
 constructor(config,fetcher=globalThis.fetch){this.config=config;this.fetcher=fetcher}
 async eval(script,keys,args=[]){
  try{
   const response=await this.fetcher(this.config.redisURL,{method:'POST',headers:{Authorization:`Bearer ${this.config.redisToken}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',script,keys.length,...keys,...args.map(String)]),signal:AbortSignal.timeout(5000),redirect:'error'});
   if(!response.ok)throw Error();const data=await response.json();
   if(data.error||typeof data.result!=='string')throw Error();
   if(data.result!=='OK')throw new BetaError(data.result);
  }catch(e){if(e instanceof BetaError)throw e;throw new BetaError('AI_UNAVAILABLE')}
 }
 ready(){return this.eval(READY,[BUDGET_KEY])}
 authorize(id,hash){return this.eval(AUTHORIZE,[INVITES_KEY],[id,hash])}
 attempt(ip,now=Date.now()){const bucket=Math.floor(now/60000);return this.eval(ATTEMPT,[BUDGET_KEY,PREFIX+`login:${ip}:${bucket}`,PREFIX+`login:all:${bucket}`])}
 reservationKeys(id,requestId,now){const bucket=Math.floor(now/60000);return [BUDGET_KEY,PREFIX+`rate:invite:${id}:${bucket}`,PREFIX+`rate:all:${bucket}`,PREFIX+'active:all',PREFIX+'active:invite:'+id,PREFIX+`request:${id}:${requestId}`,INVITES_KEY]}
 async reserve(id,requestId,amount,now=Date.now(),inviteHash){
  const keys=this.reservationKeys(id,requestId,now);await this.eval(RESERVE,keys,[amount,this.config.budgetMicros,now,id,inviteHash]);return {keys};
 }
 finish(reservation,actual,usage){
  const k=reservation.keys;
  return this.eval(FINISH,[k[0],k[3],k[4],k[5]],actual===null?['unknown',0,0,0,0]:['settled',actual,usage.input_tokens,usage.output_tokens,usage.input_tokens_details?.cached_tokens||0]);
 }
}
