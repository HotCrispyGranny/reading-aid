import {label,noteOriginLabel} from './labels';
import {openDB} from 'idb';
import type {DocState} from './types';
const db=openDB('judu-reader',1,{upgrade(db){db.createObjectStore('documents',{keyPath:'id'})}});
export async function fingerprint(data:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function listDocs():Promise<DocState[]>{return (await (await db).getAll('documents')).sort((a,b)=>b.updated-a.updated)}
export async function getDoc(id:string):Promise<DocState|undefined>{return (await db).get('documents',id)}
export async function saveDoc(doc:DocState){await (await db).put('documents',doc)}
export async function removeDoc(id:string){await (await db).delete('documents',id)}
export function download(name:string,blob:Blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export async function exportBackup(){
 const docs=await listDocs();const records=await Promise.all(docs.map(async d=>{const bytes=new Uint8Array(await d.blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return {...d,blob:btoa(s)}}));
 download('judu-reading-backup.json',new Blob([JSON.stringify({version:1,documents:records})],{type:'application/json'}));
}
export async function restoreBackup(file:File){
 if(file.size>300*1024*1024)throw Error('This backup exceeds 300 MB. Please import smaller backups.');
 const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.documents))throw Error('Unsupported backup format');
 // Validate everything before touching existing records; verify PDF identity.
 const docs:DocState[]=[];
 for(const d of data.documents){
  if(typeof d.id!=='string'||typeof d.blob!=='string'||!['marks','notes','words','messages'].every(k=>Array.isArray(d[k])))throw Error('Incomplete backup data');
  const bytes=Uint8Array.from(atob(d.blob),c=>c.charCodeAt(0));if(await fingerprint(bytes.buffer)!==d.id)throw Error('PDF checksum mismatch. Backup was not imported.');
  docs.push({...d,blob:new Blob([bytes],{type:'application/pdf'}),analyses:d.analyses||{}});
 }
 const store=await db;const tx=store.transaction('documents','readwrite');for(const d of docs)await tx.store.put(d);await tx.done;return docs.length;
}
export function notesMarkdown(doc:DocState){return `# ${doc.name}\n\n`+doc.notes.map(n=>`## ${label(n.category)} · Page ${n.page}\n\n> ${n.text.replace(/\n/g,'\n> ')}\n\n${n.body}\n\n*Source: ${noteOriginLabel(n.origin)}*\n`).join('\n')}
