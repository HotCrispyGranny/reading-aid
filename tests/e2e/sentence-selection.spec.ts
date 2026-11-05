import {test,expect,type Locator} from '@playwright/test';

test.use({deviceScaleFactor:2});

// Uses the existing generated text PDF. No real provider requests or AI key.
test('partial-item words select distinct sentences with precise focus at multiple zooms',async({page})=>{
 await page.goto('/');
 await page.locator('input[type=file][accept*="pdf"]').setInputFiles('tests/fixtures/reader.pdf');
 const root=page.locator('.pdf-page[data-page="1"]');
 const line=root.locator('.textLayer [data-item]').filter({hasText:'Dr. Wu measured 3.5 mL'}).first();
 await expect(line).toBeAttached({timeout:30000});
 async function wordBox(line:Locator,word:string){
  return line.evaluate((span,word)=>{
   const node=span.firstChild!,start=span.textContent!.indexOf(word);if(start<0)throw Error('Missing fixture word');
   const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+word.length);
   const {x,y,width,height}=range.getBoundingClientRect();return {x,y,width,height};
  },word);
 }
 for(let zoom=0;zoom<3;zoom++){
  if(zoom){const old=await line.elementHandle();await page.getByRole('button',{name:'Zoom in',exact:true}).click();await old?.waitForElementState('hidden');await expect(line).toBeAttached();await expect(root.locator('.page-loading')).toHaveCount(0)}
  await line.scrollIntoViewIfNeeded();
  const first=await wordBox(line,'Wu');await page.mouse.click(first.x+first.width/2,first.y+first.height/2);
  await expect(page.locator('.sentence-quote')).toHaveText('Dr. Wu measured 3.5 mL in the first experiment.');
  await expect.poll(async()=>{
   const shape=await root.locator('.focus-shape').first().boundingBox(),next=await wordBox(line,'The result');
   return !!shape&&shape.x+shape.width<next.x;
  }).toBe(true);
  const second=await wordBox(line,'stable');await page.mouse.click(second.x+second.width/2,second.y+second.height/2,{button:'right'});
  await expect(page.locator('.sentence-quote')).toHaveText('The result was stable.');
  await expect(root.locator('.focus-shape').first()).toBeVisible();
 }
});
