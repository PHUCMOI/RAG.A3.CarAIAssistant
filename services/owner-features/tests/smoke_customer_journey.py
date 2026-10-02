"""Local full journey regression. Creates isolated test customers and fictitious records."""
import os, uuid, concurrent.futures
from datetime import datetime, timedelta, timezone
import httpx
ROOT=os.getenv('ORDERS_URL','http://localhost:5173')+'/api/orders-service'
def call(c,method,path,body=None,status=200,key=None):
    headers={}
    if method!='GET':
        headers={'X-CSRF-TOKEN':c.get('/auth/csrf').json()['token'],'Idempotency-Key':key or str(uuid.uuid4())}
    r=c.request(method,path,json=body,headers=headers)
    assert r.status_code==status,(method,path,r.status_code,r.text)
    return r.json() if r.content else None
def login(email,password):
    c=httpx.Client(base_url=ROOT,timeout=30)
    call(c,'POST','/auth/login',{'email':email,'password':password})
    return c
admin=login('admin@autowise.test','DemoAdmin!2026')
tag=uuid.uuid4().hex
email='journey-'+tag+'@autowise.test';pw='Journey!Test2026'
u=call(admin,'POST','/admin/customers',{'email':email,'password':pw,'displayName':'Journey test'},201)
other=call(admin,'POST','/admin/customers',{'email':'other-'+tag+'@autowise.test','password':pw,'displayName':'Other test'},201)
a=login(email,pw);old=login(email,pw);b=login(other['email'],pw)
profile=call(a,'GET','/my/profile');assert profile['phone'] is None and not profile['createdAtEstimated']
profile=call(a,'PATCH','/my/profile',{'version':profile['version'],'displayName':'Journey owner','phone':'0901 234 567'})
assert profile['phone']=='+84901234567'
call(a,'PATCH','/my/profile',{'version':profile['version']-1,'displayName':'Stale'},409)
call(a,'GET','/admin/purchase-requests',status=403);call(admin,'GET','/my/profile',status=403)
body={'carId':'car_34_3','dealerId':4,'phone':'0901234567','contactMethod':'phone','notes':'Integration test'}
call(a,'POST','/my/purchase-requests',dict(body,carId='missing'),422)
call(a,'POST','/my/purchase-requests',dict(body,dealerId=1),422)
assert call(a,'GET','/my/purchase-requests')['totalCount']==0
assert a.post('/my/purchase-requests',json=body).status_code==400
key=str(uuid.uuid4());p=call(a,'POST','/my/purchase-requests',body,key=key)
assert call(a,'POST','/my/purchase-requests',body,key=key)==p
call(a,'POST','/my/purchase-requests',dict(body,notes='different'),409,key)
path='/my/purchase-requests/'+p['id'];adminpath='/admin/purchase-requests/'+p['id']
call(b,'GET',path,status=404);call(b,'PATCH',path,dict(body,version=1),404)
p=call(a,'PATCH',path,dict(body,version=p['version'],notes='Edited'))
csrf=admin.get('/auth/csrf').json()['token'];customer_csrf=a.get('/auth/csrf').json()['token'];v=p['version']
def race_accept(i):
    c,route,payload,token=(admin,adminpath+'/accept',{'version':v},csrf) if i==0 else (a,path,dict(body,version=v,notes='Race'),customer_csrf)
    return c.request('POST' if i==0 else 'PATCH',route,json=payload,headers={'X-CSRF-TOKEN':token,'Idempotency-Key':str(uuid.uuid4())}).status_code
with concurrent.futures.ThreadPoolExecutor(2) as pool: assert sorted(pool.map(race_accept,range(2)))==[200,409]
p=call(a,'GET',path)
if p['status']=='submitted':p=call(admin,'POST',adminpath+'/accept',{'version':p['version']})
p=call(admin,'POST',adminpath+'/responses',{'version':p['version'],'reason':'Agreed consultation'})
count=call(a,'GET','/my/orders')['totalCount']
call(admin,'POST',adminpath+'/convert',{'version':p['version'],'reason':'Invalid price','totalVnd':-1},422)
assert call(a,'GET','/my/orders')['totalCount']==count and call(a,'GET',path)['orderId'] is None
convert={'version':p['version'],'reason':'Test agreement','totalVnd':1000000,'depositRequiredVnd':100000,'variant':'Test'}
def race_convert(_):
    return admin.post(adminpath+'/convert',json=convert,headers={'X-CSRF-TOKEN':csrf,'Idempotency-Key':str(uuid.uuid4())}).status_code
with concurrent.futures.ThreadPoolExecutor(2) as pool: assert sorted(pool.map(race_convert,range(2)))==[200,409]
p=call(a,'GET',path);o=call(a,'GET','/my/orders/'+p['orderId'])
assert o['customerId']==u['id'] and o['status']=='pending_confirmation' and not o['payments'] and o['totalVnd']==1000000
assert call(a,'GET','/my/orders')['totalCount']==count+1
profile=call(a,'PATCH','/my/profile',{'version':profile['version'],'displayName':'New profile','phone':None})
assert call(a,'GET','/my/orders/'+o['id'])['customerName']=='Journey owner'
change=call(a,'POST','/my/change-requests',{'orderId':o['id'],'type':'cancel','reason':'Test cancellation request'})
call(a,'POST','/my/change-requests',{'orderId':o['id'],'type':'change','reason':'Duplicate pending'},422)
call(b,'POST','/my/change-requests',{'orderId':o['id'],'type':'cancel','reason':'Other customer'},404)
change=call(admin,'POST','/admin/change-requests/'+change['id']+'/decision',{'version':1,'decision':'approved','reason':'Will discuss refund separately'})
assert change['status']=='approved' and call(a,'GET','/my/orders/'+o['id'])==o
favkey=str(uuid.uuid4());call(a,'POST','/my/favorites',{'carId':'car_34_3'},key=favkey)
call(a,'POST','/my/favorites',{'carId':'car_34_3'},key=favkey)
call(a,'POST','/my/favorites',{'carId':'car_34_3'})
assert len(call(a,'GET','/my/favorites'))==1 and call(b,'GET','/my/favorites')==[]
call(a,'DELETE','/my/favorites/car_34_3',status=204);assert call(a,'GET','/my/favorites')==[]
start=datetime.now(timezone.utc)+timedelta(days=30);end=start+timedelta(hours=1)
slotbody={'dealerId':4,'staffName':tag,'startsAt':start.isoformat(),'endsAt':end.isoformat()}
slot=call(admin,'POST','/admin/appointment-slots',slotbody)
call(admin,'POST','/admin/appointment-slots',slotbody,422)
appointment={'carId':'car_34_3','slotId':slot['id'],'kind':'test_drive','phone':'0901234567','notes':'Test'}
csrf_a=a.get('/auth/csrf').json()['token'];csrf_b=b.get('/auth/csrf').json()['token']
def race_booking(i):
    c,token=(a,csrf_a) if i==0 else (b,csrf_b)
    r=c.post('/my/appointments',json=appointment,headers={'X-CSRF-TOKEN':token,'Idempotency-Key':str(uuid.uuid4())})
    return i,r.status_code,r.json()
with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(race_booking,range(2)))
assert sorted(r[1] for r in results)==[200,422]
winner=next(r for r in results if r[1]==200);owner=a if winner[0]==0 else b;ap=winner[2]
outsider=b if owner is a else a
call(outsider,'POST','/my/appointments/'+ap['id']+'/actions',{'version':1,'action':'cancel','reason':'Other'},404)
other_slot=call(admin,'POST','/admin/appointment-slots',dict(slotbody,startsAt=(start+timedelta(days=1)).isoformat(),endsAt=(end+timedelta(days=1)).isoformat()))
ap=call(admin,'POST','/admin/appointments/'+ap['id']+'/actions',{'version':ap['version'],'action':'propose','reason':'New time','slotId':other_slot['id']})
assert ap['status']=='proposed'
ap=call(owner,'POST','/my/appointments/'+ap['id']+'/actions',{'version':ap['version'],'action':'accept','reason':'Agreed'})
assert ap['status']=='confirmed'
ap=call(owner,'POST','/my/appointments/'+ap['id']+'/actions',{'version':ap['version'],'action':'cancel','reason':'Test finished'})
assert ap['status']=='cancelled'
notices=call(a,'GET','/my/notifications')['items'];assert len(notices)>=4
n=notices[0];call(b,'POST','/my/notifications/'+n['id']+'/read',status=404)
read=call(a,'POST','/my/notifications/'+n['id']+'/read');assert call(a,'POST','/my/notifications/'+n['id']+'/read')==read
call(a,'POST','/my/password',{'currentPassword':'wrong','newPassword':'NewJourney!2026','confirmPassword':'NewJourney!2026'},422)
assert call(old,'GET','/me')['id']==u['id']
call(a,'POST','/my/password',{'currentPassword':pw,'newPassword':'NewJourney!2026','confirmPassword':'NewJourney!2026'},204)
call(old,'GET','/me',status=401);call(a,'GET','/me',status=401)
call(old,'POST','/auth/login',{'email':email,'password':pw},401)
fresh=login(email,'NewJourney!2026');assert call(fresh,'GET','/my/profile')['displayName']=='New profile'
call(fresh,'POST','/auth/logout',status=204);call(fresh,'GET','/me',status=401)
print('PASS: profile/stamp revocation, CSRF/roles/ownership, snapshot, request replay/races/convert rollback, proposals, favorites, appointment overbooking/proposal/acceptance, notifications, logout')
