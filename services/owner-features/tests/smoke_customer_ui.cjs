// Run with Node and Playwright available (uses a fresh headless browser profile).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ORDERS_URL || 'http://localhost:5173';
async function visible(locator){await locator.waitFor({state:'visible',timeout:20000});}
(async()=>{
 const browser=await chromium.launch({channel:process.env.UI_BROWSER_CHANNEL||'msedge',headless:true});
 try{
  const customer=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await customer.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/account/purchase-requests/new?carId=car_34_3');
  await page.waitForURL('**/login?returnTo=*');
  await page.getByLabel('Email',{exact:true}).fill('customer1@autowise.test');
  await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCustomer!2026');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await page.waitForURL('**/account/purchase-requests/new?carId=car_34_3');
  await visible(page.getByLabel('Xe mong muốn'));assert.equal(await page.getByLabel('Xe mong muốn').inputValue(),'car_34_3');
  await page.getByLabel('Đại lý hỗ trợ hãng xe').selectOption('4');
  await page.getByLabel('Số điện thoại',{exact:true}).fill('0901234567');
  await page.getByLabel('Ghi chú',{exact:true}).fill('UI integration smoke');
  await page.getByLabel('Số điện thoại',{exact:true}).fill('abc');
  await page.getByRole('button',{name:'Gửi yêu cầu',exact:true}).click();
  await visible(page.getByRole('alert'));
  assert.equal(await page.getByLabel(/Ghi chú/).inputValue(),'UI integration smoke');
  await page.getByLabel('Số điện thoại',{exact:true}).fill('0901234567');
  await page.getByRole('button',{name:'Gửi yêu cầu',exact:true}).click();
  await page.waitForURL(/\/account\/purchase-requests\/[a-f0-9-]+$/);
  const id=page.url().split('/').pop();await visible(page.getByRole('heading',{name:/PR-/}));
  await page.getByRole('button',{name:'Sửa yêu cầu',exact:true}).click();
  await page.getByLabel(/Ghi chú/).fill('Updated UI draft');
  await page.getByRole('button',{name:'Lưu yêu cầu',exact:true}).click();
  await visible(page.getByText('Updated UI draft',{exact:true}));
  await page.goto(base+'/account/profile');await visible(page.getByLabel('Họ tên'));
  await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click();
  await visible(page.getByRole('status'));assert.equal(await page.getByRole('status').innerText(),'Đã lưu thông tin cá nhân.');
  await page.goto(base+'/cars/car_34_3');await visible(page.getByRole('button',{name:'Lưu yêu thích'}));
  await page.getByRole('button',{name:'Lưu yêu thích'}).click();await visible(page.getByText('Đã lưu xe yêu thích.'));
  await page.goto(base+'/account/favorites');await visible(page.getByRole('heading',{name:'Honda CR-V',exact:true}));
  for(const [route,heading] of [['/account','Tài khoản của'],['/account/security','Đổi mật khẩu'],['/account/orders','Đơn hàng'],['/account/change-requests','Đề nghị thay đổi / hủy đơn'],['/account/appointments','Lịch tư vấn / lái thử'],['/account/notifications','Thông báo'],['/account/assistant','Trợ lý']]){
   await page.goto(base+route);await visible(page.getByRole('heading',{level:1}).first());
   assert.equal(await page.locator('a[href^="/admin"]').count(),0);
  }
  await page.goto(base+'/account/appointments');await visible(page.getByLabel(/^Xe/));
  await page.getByLabel(/^Xe/).selectOption('car_34_3');
  assert.ok(await page.getByLabel('Khung giờ còn trống').locator('option').count()>1);
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/account');await visible(page.getByRole('heading',{level:1}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile account layout overflow');
  await page.screenshot({path:'docs/customer-account-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'docs/customer-account-preview.png',fullPage:true});
  await page.goto(base+'/admin/purchase-requests');await page.waitForURL('**/account/orders');
  const adminContext=await browser.newContext({viewport:{width:1440,height:1000}});const admin=await adminContext.newPage();admin.on('pageerror',e=>errors.push(e.message));
  await admin.goto(base+'/admin/login');await admin.getByLabel('Email',{exact:true}).fill('admin@autowise.test');await admin.getByLabel('Mật khẩu',{exact:true}).fill('DemoAdmin!2026');await admin.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await admin.waitForURL('**/admin/orders');
  await admin.goto(base+'/admin/purchase-requests/'+id);await visible(admin.getByRole('button',{name:'Tiếp nhận tư vấn',exact:true}));
  await admin.getByRole('button',{name:'Tiếp nhận tư vấn',exact:true}).click();await visible(admin.getByRole('heading',{name:'Chuyển thành đơn',exact:true}));
  await admin.getByLabel('Giá chốt VND').fill('1000000');await admin.getByLabel('Cọc yêu cầu VND').fill('100000');await admin.getByLabel('Nội dung đã thống nhất với khách').fill('UI demo agreement');
  await admin.getByRole('button',{name:'Tạo đơn chính thức',exact:true}).click();await visible(admin.getByRole('link',{name:'Mở đơn chính thức',exact:true}));
  assert.equal(await admin.locator('a[href^="/account"],a[href="/cars"],a[href="/"]').count(),0);
  await admin.screenshot({path:'docs/customer-request-admin-preview.png',fullPage:true});
  for(const route of ['/admin/purchase-requests','/admin/change-requests','/admin/appointments']){await admin.goto(base+route);await visible(admin.getByRole('heading',{level:1}).first());}
  await admin.goto(base+'/admin/appointments');await visible(admin.getByLabel('Nhân viên'));
  await admin.goto(base+'/account');await admin.waitForURL('**/admin/orders');
  await page.goto(base+'/account/purchase-requests/'+id);await visible(page.getByRole('link',{name:'Mở đơn chính thức',exact:true}));await page.getByRole('link',{name:'Mở đơn chính thức',exact:true}).click();
  await visible(page.getByRole('link',{name:'Đề nghị thay đổi / hủy đơn'}));
  await page.goto(base+'/account/profile');await visible(page.getByRole('button',{name:'Đăng xuất',exact:true}));await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await page.waitForURL('**/login');
  assert.deepEqual(errors,[]);console.log('PASS: UI login returnTo, profile confirmation, purchase edit/admin conversion, favorites, account/admin routes, slot forms, logout, mobile layout and no React errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
