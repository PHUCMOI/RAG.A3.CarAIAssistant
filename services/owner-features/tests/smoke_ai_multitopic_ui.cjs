const {chromium,expect}=require(require('node:path').resolve(__dirname, '../../../frontend/node_modules/@playwright/test'));
const fs=require('fs'); const output=require('node:path').resolve(__dirname, '../../../docs/qa-artifacts');fs.mkdirSync(output,{recursive:true});const results=[];
(async()=>{const b=await chromium.launch({channel:'msedge',headless:false,slowMo:150});const p=await b.newPage({viewport:{width:1440,height:1000}});try{
await p.goto('http://localhost:5173/chat');
async function send(text,file){if(file)await p.locator('input[type=file]').setInputFiles(file);await p.getByRole('textbox',{name:'Câu hỏi'}).fill(text);const wait=p.waitForResponse(r=>r.request().method()==='POST'&&(/\/(catalogue-messages|messages)$/.test(r.url())||r.url().endsWith('/api/chat')||r.url().endsWith('/api/image-service/chat')||r.url().endsWith('/api/chat/compose')),{timeout:120000});await p.getByRole('button',{name:/^(Gửi →|Gửi câu hỏi)$/}).click();const r=await wait;const d=await r.json();if(r.status()!==200)throw Error(text+': HTTP '+r.status()+' '+JSON.stringify(d));const m=d.messages?.at(-1)||{content:d.answer,generationMode:d.generationMode||d.generation_mode,contexts:d.contexts||d.catalog_contexts};expect(m.generationMode).toBe('bedrock-natural');await expect(p.locator('.assistant-thinking')).toHaveCount(0,{timeout:120000});results.push({question:text,answer:m.content,status:'pass'});console.log('PASS',text);return m;}
await send('cai do sao roi');
await send('tu van suv 5 cho duoi 1 ty');
await send('so sanh tuscon va xe hrv');await expect(p.locator('.assistant-answer-natural table').last()).toBeVisible();await p.locator('.order-chat-message.assistant').last().scrollIntoViewIfNeeded();await p.screenshot({path:output+'/compare-desktop.png'});
await p.setViewportSize({width:375,height:812});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await p.screenshot({path:output+'/compare-mobile.png'});await p.setViewportSize({width:1440,height:1000});
await send('don hag cua toi con phai thanh taon bn');
await p.goto('http://localhost:5173/login?returnTo=%2Fchat');await p.getByLabel('Email',{exact:true}).fill('customer2@autowise.test');await p.getByLabel('Mật khẩu',{exact:true}).fill('DemoCustomer!2026');await p.locator('.login-submit').click();await p.waitForURL('**/chat');await expect(p.locator('.assistant-thinking')).toHaveCount(0,{timeout:120000});await p.getByRole('button',{name:'+ Hội thoại mới',exact:true}).click();
await send('cai do sao roi');
const img=await send('day la xe gi va bao hnah ntn',require('node:path').resolve(__dirname, '../../../dataset/images/car_29_5/Ford$$Edge$$2016$$Black$$29_5$$199$$image_0.jpg'));expect(img.contexts[0].carId).toBe('car_29_5');expect(img.content).toMatch(/Ford Edge/);expect(img.content).toMatch(/95[.,]3/);
const price=await send('xe do gia bn');expect(price.contexts[0].carId).toBe('car_29_5');
const unresolved=await send('don hag cua toi con phai thanh taon bn?');expect(unresolved.sections||[]).toHaveLength(0);const code=unresolved.content.match(/AW-[A-Z0-9]+(?:-[A-Z0-9]+)*/)?.[0];if(!code)throw Error('Missing order reference options');
const payment=await send('don '+code+' con phai thanh taon bn?');expect(payment.sections.some(s=>s.topic==='payment')).toBe(true);expect(payment.orderCode).toBe(code);
const delivery=await send('khi nao nhan xee cua don do?');expect(delivery.orderCode).toBe(code);
const multi=await send('don do trang thai sao, con no bn va giay to con thieu gi?');expect(multi.sections.map(s=>s.topic)).toEqual(expect.arrayContaining(['status','payment','documents']));
await send('so sanh tucson va hrv');
const bad=await send('don AW-NOT-MY-ORDER thanh toan bn');expect(bad.sections||[]).toHaveLength(0);
await p.reload();await expect(p.locator('.order-chat-message.assistant').last()).toBeVisible();await p.locator('.order-chat-message.assistant').last().scrollIntoViewIfNeeded();await p.screenshot({path:output+'/mixed-dialogue.png'});console.log('PASS persistence');
const titles=await p.locator('.assistant-history-list button strong').allTextContents();console.log('TITLES',JSON.stringify(titles.slice(0,3)));
}finally{fs.writeFileSync(output+'/live-results.json',JSON.stringify(results,null,2));await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
