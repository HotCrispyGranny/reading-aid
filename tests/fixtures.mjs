import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {mkdir,writeFile} from 'node:fs/promises';
export async function generateFixtures(){
 await mkdir('tests/fixtures',{recursive:true});const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.TimesRoman);
 const p=pdf.addPage([612,792]);const lines=[
  'Sentence focus for scientific reading',
  'Dr. Wu measured 3.5 mL in the first experiment. The result was stable.',
  'This long sentence starts on one line and continues across the next',
  'line, so all of its words must stay focused together.',
  'The impeller generated a rotational flow within the cylindrical vessel.',
  'Power number is a dimensionless parameter in this experiment.',
  'The investigators compared a conventional agitator with the new design.',
  'A lower speed reduced erosion but did not eliminate all operational risks.',
  'The sample was collected under a constant temperature of 25 degrees C.',
  'The results are valid only within the tested concentration range.',
 ];lines.forEach((text,i)=>p.drawText(text,{x:48,y:720-i*23,size:12,font}));
 const two=pdf.addPage([612,792]);
 for(let i=0;i<14;i++)two.drawText(`Left column sentence ${i+1} is read first.`,{x:40,y:720-i*22,size:11,font});
 for(let i=0;i<14;i++)two.drawText(`Right column sentence ${i+1} follows.`,{x:320,y:720-i*22,size:11,font});
 two.drawText('The final observation was obtained',{x:320,y:390,size:11,font});
 two.drawText('after a careful series of measurements',{x:320,y:374,size:11,font});
 const continuation=pdf.addPage([612,792]);continuation.drawText('under controlled conditions in the same laboratory.',{x:40,y:720,size:11,font});continuation.drawText('The next sentence starts a new conclusion.',{x:40,y:698,size:11,font});
 const scan=pdf.addPage([612,792]);scan.drawRectangle({x:50,y:50,width:510,height:690,color:rgb(.92,.92,.9)});
 await writeFile('tests/fixtures/reader.pdf',await pdf.save());
 const single=await PDFDocument.create();single.addPage([612,792]);await writeFile('tests/fixtures/scanned.pdf',await single.save());
 return 'tests/fixtures/reader.pdf';
}
if(process.argv[1]?.endsWith('fixtures.mjs'))await generateFixtures();
