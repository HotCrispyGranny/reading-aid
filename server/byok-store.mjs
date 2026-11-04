import {RedisBetaStore,PREFIX} from './beta-store.mjs';

export const BYOK_READY=`redis.call('PING'); return 'OK'`;
// These keys and scripts are deliberately disjoint from the owner money ledger.
export const BYOK_RESERVE=`
if redis.call('EXISTS',KEYS[7])==1 then return 'DUPLICATE_REQUEST' end
if tonumber(redis.call('GET',KEYS[1]) or '0')>=5 or tonumber(redis.call('GET',KEYS[2]) or '0')>=10 or tonumber(redis.call('GET',KEYS[3]) or '0')>=20 then return 'RATE_LIMITED' end
local now=tonumber(ARGV[1]);
for i=4,6 do redis.call('ZREMRANGEBYSCORE',KEYS[i],'-inf',now-120000) end
if redis.call('ZCARD',KEYS[4])>=1 or redis.call('ZCARD',KEYS[5])>=2 or redis.call('ZCARD',KEYS[6])>=3 then return 'RATE_LIMITED' end
for i=1,3 do redis.call('INCR',KEYS[i]); redis.call('EXPIRE',KEYS[i],120) end
for i=4,6 do redis.call('ZADD',KEYS[i],now,KEYS[7]) end
redis.call('SET',KEYS[7],'active','EX',86400); return 'OK'`;
export const BYOK_FINISH=`
for i=4,6 do redis.call('ZREM',KEYS[i],KEYS[7]) end
redis.call('SET',KEYS[7],'done','EX',86400); return 'OK'`;

export class RedisByokStore extends RedisBetaStore{
 readyByok(){return this.eval(BYOK_READY,[])}
 byokKeys(id,ip,requestId,now){
  const p=PREFIX+'byok:',bucket=Math.floor(now/60000);
  return [p+`rate:client:${id}:${bucket}`,p+`rate:ip:${ip}:${bucket}`,p+`rate:all:${bucket}`,p+'active:client:'+id,p+'active:ip:'+ip,p+'active:all',p+`request:${id}:${requestId}`];
 }
 async reserveByok(id,ip,requestId,now=Date.now()){
  const keys=this.byokKeys(id,ip,requestId,now);await this.eval(BYOK_RESERVE,keys,[now]);return {keys};
 }
 finishByok(lease){return this.eval(BYOK_FINISH,lease.keys)}
}
