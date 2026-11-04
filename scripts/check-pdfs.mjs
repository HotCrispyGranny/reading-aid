import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {extractPage,joinContinuations} from '../src/lib/sentences.mjs';
const dir=process.argv[2]||'.local/papers';const files=(await fs.readdir(dir)).filter(f=>f.toLowerCase().endsWith('.pdf'));let scans=0;
for(const file of files){
 const pdf=await getDocument({data:new Uint8Array(await fs.readFile(path.join(dir,file))),useSystemFonts:true}).promise;const pages=[];let textPages=0;
 for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),tc=await page.getTextContent(),v=page.getViewport({scale:1});const p=extractPage(tc.items,v.width,v.height,n);pages.push(p);if(p.itemCount)textPages++;
  for(const s of p.sentences)for(const r of s.runs){assert.ok(tc.items[r.itemIndex]?.str!==undefined);assert.ok(r.start>=0&&r.end<=tc.items[r.itemIndex].str.length&&r.start<=r.end)}
 }
 const sentences=joinContinuations(pages);const scan=textPages===0;if(scan){scans++;assert.equal(sentences.length,0)}
 console.log(JSON.stringify({file,pages:pdf.numPages,textPages,scan,sentences:sentences.length,twoColumnPages:pages.filter(p=>p.gutter!==null).length,crossPageSentences:sentences.filter(s=>new Set(s.runs.map(r=>r.page)).size>1).length}));await pdf.destroy();
}
console.log(`Validated coordinate anchors in ${files.length} PDFs; ${scans} scanned-only PDFs identified. This checks mappings, not perfect linguistic segmentation.`);
