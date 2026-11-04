import * as pdfjs from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {extractPage,joinContinuations} from './sentences.mjs';
import type {PageData,Sentence} from './types';
pdfjs.GlobalWorkerOptions.workerSrc=worker;
export {pdfjs};
export type PDFDoc=pdfjs.PDFDocumentProxy;
export async function parseDocument(pdf:PDFDoc,onPage:(pages:PageData[],sentences:Sentence[])=>void,cancel:()=>boolean){
 const pages:PageData[]=[];
 for(let n=1;n<=pdf.numPages;n++){
  if(cancel())return;
  const p=await pdf.getPage(n);const tc=await p.getTextContent();const vp=p.getViewport({scale:1});
  pages.push(extractPage(tc.items.filter((i:any)=>'str'in i) as any[],vp.width,vp.height,n) as PageData);
  if(n===1||n%3===0||n===pdf.numPages)onPage([...pages],joinContinuations(pages) as Sentence[]);
  await new Promise(r=>setTimeout(r,0));
 }return pages;
}
