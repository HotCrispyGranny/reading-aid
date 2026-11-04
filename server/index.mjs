import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EnvHttpProxyAgent,setGlobalDispatcher} from 'undici';
// Environment files and proxy initialization belong to the local process launcher.
try{process.loadEnvFile()}catch(e){if(e.code!=='ENOENT')throw e}
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
const {default:app}=await import('./app.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.NODE_ENV==='production'){app.use(express.static(path.join(root,'dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(path.join(root,'dist/index.html')))}else{
 const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
const args=process.argv.slice(2);const flag=n=>args[args.indexOf(n)+1];const port=Number(process.env.PORT||(args.includes('--port')?flag('--port'):4173));const host=process.env.HOST||(args.includes('--host')?flag('--host'):'0.0.0.0');
app.listen(port,host,()=>console.log(`句读 reader listening on ${host}:${port}; AI ${process.env.AI_API_KEY?'configured':'not configured'}`));
