// Record the actual local app; no response interception or fixture replacement.
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {chromium}=require(path.join(root,'frontend/node_modules/playwright'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
 const output=path.join(root,'docs/submission/demo');
 const staging=path.join(root,'.local/demo-recording');
 await fs.mkdir(output,{recursive:true});await fs.mkdir(staging,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const screenshotsOnly=process.argv.includes('--screenshots-only');
 const context=await browser.newContext({viewport:{width:1280,height:800},...(screenshotsOnly?{}:{recordVideo:{dir:staging,size:{width:1280,height:800}}})});
 const page=await context.newPage();const video=page.video();
 const evidence={recordedAt:new Date().toISOString(),baseUrl:'http://localhost:5173',scope:'Silent local app recording: catalogue, compare, guest text and image chat; no customer/admin demo',turns:[],pageErrors:[]};
 page.on('pageerror',error=>evidence.pageErrors.push(error.message));
 try{
   await page.goto(evidence.baseUrl,{waitUntil:'networkidle'});await delay(3000);
   await page.getByRole('link',{name:'Khám phá xe',exact:true}).click();await delay(3000);
   await page.getByRole('button',{name:'+ So sánh',exact:true}).first().click();
   await page.getByRole('button',{name:'+ So sánh',exact:true}).first().click();
   await page.getByRole('link',{name:'So sánh (2)',exact:true}).click();await delay(4000);
   await page.screenshot({path:path.join(output,'compare.png')});
   await page.goto(evidence.baseUrl+'/chat',{waitUntil:'networkidle'});await delay(2000);
   async function turn(question){
     await page.getByRole('textbox',{name:'Câu hỏi',exact:true}).fill(question);
     const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat/turns' && r.request().method()==='POST',{timeout:240000});
     await page.getByRole('button',{name:'Gửi →',exact:true}).click();
     const response=await pending;const data=await response.json();
     evidence.turns.push({question,httpStatus:response.status(),response:data});
     if(!response.ok()) throw new Error('Live chat failed: HTTP '+response.status());
     await page.getByRole('button',{name:'Gửi →',exact:true}).waitFor({state:'visible'});await delay(4000);
   }
   await turn('Giá Honda CR-V');
   await page.screenshot({path:path.join(output,'text-chat.png')});
   const cases=(await fs.readFile(path.join(root,'eval/ground_truth_submission.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
   const imageCase=cases.find(c=>c.id==='Q103');
   await page.locator('input[type=file]').setInputFiles(path.join(root,imageCase.image));
   await turn('Xe trong ảnh gần giống mẫu xe nào?');
   await page.screenshot({path:path.join(output,'image-chat.png')});
   evidence.completed=true;
 }catch(error){evidence.completed=false;evidence.error=error.message;process.exitCode=1;}
 finally{
   await context.close();await browser.close();
   const final=video?path.join(output,'local-demo-'+new Date().toISOString().replaceAll(':','-').replaceAll('.','-')+'.webm'):null;
   if(video) await video.saveAs(final);
   evidence.video=final?path.basename(final):null;
   evidence.recordingMode=screenshotsOnly?'screenshots-only':'video';
   await fs.writeFile(path.join(root,'docs/submission/evidence/demo-live.json'),JSON.stringify(evidence,null,2));
   console.log(JSON.stringify({completed:evidence.completed,video:final,error:evidence.error}));
 }
})();
