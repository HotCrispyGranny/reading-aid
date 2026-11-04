import fs from 'node:fs';
import {test,expect} from '@playwright/test';
const paper=process.env.TEST_PDF||'/workspace/attachments/ce11649f-ca57-4a85-93d5-e05a318f317e/Swirl Flow (Minerals Eng Wu et al 2021).pdf';
test('real PDF render and focus',async({page})=>{
 test.skip(!fs.existsSync(paper),'Set TEST_PDF to the real uploaded Minerals Engineering paper.');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('console',m.text())});
 await page.goto('/');await expect(page.getByRole('heading',{name:'A little more focus. One sentence at a time.'})).toBeVisible();
 await page.locator('input[type=file][accept*="pdf"]').setInputFiles(paper);
 await expect(page.locator('.pdf-page[data-page="1"] .textLayer [data-item]').first()).toBeAttached({timeout:30000});
 await expect(page.locator('.parse-progress')).toContainText('sentences indexed',{timeout:30000});
 const target=page.locator('.pdf-page[data-page="1"] .textLayer span').filter({hasText:'Regular maintenance shutdowns'}).first();
 await target.click();await expect(page.locator('.focus-box').first()).toBeVisible();await expect(page.locator('.sentence-quote')).toContainText('Regular maintenance shutdowns');
 await page.screenshot({path:'/tmp/judu-reading.png',fullPage:true});
 await page.keyboard.press('ArrowDown');await expect(page.locator('.sentence-quote')).toContainText('labour cost');
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.locator('.focus-box').first()).toBeVisible();
 const geometry=await page.locator('.pdf-page[data-page="1"]').evaluate(root=>{const r=root.getBoundingClientRect();const box=root.querySelector('.focus-box')!.getBoundingClientRect();return {left:box.left-r.left,top:box.top-r.top,width:box.width,height:box.height,pageWidth:r.width}});console.log('geometry',geometry);expect(geometry.width).toBeGreaterThan(20);expect(geometry.left).toBeGreaterThan(0);expect(geometry.left+geometry.width).toBeLessThan(geometry.pageWidth+3);
 const unavailable=await page.request.post('/api/chat',{data:{sources:[{id:'S1',page:1,text:'A real sentence.'}]}});expect(unavailable.status()).toBe(503);expect((await unavailable.json()).error).toContain('AI is optional and not configured');
 expect(errors).toEqual([]);
});
