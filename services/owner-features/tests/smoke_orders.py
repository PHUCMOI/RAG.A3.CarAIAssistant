"""Local integration check; creates one disposable demo order (no real money)."""
import os, uuid, concurrent.futures
import httpx
ROOT = os.getenv("ORDERS_URL", "http://localhost:5090") + "/api/orders-service"
def client(email):
    c=httpx.Client(base_url=ROOT, timeout=20)
    call(c,"POST","/auth/login",{"email":email,"password":"DemoAdmin!2026" if email.startswith("admin") else "DemoCustomer!2026"})
    return c
def call(c,method,path,body=None,expected=200,key=None):
    headers={}
    if method!="GET":
        headers["X-CSRF-TOKEN"]=c.get("/auth/csrf").json()["token"]
        headers["Idempotency-Key"]=key or str(uuid.uuid4())
    r=c.request(method,path,json=body,headers=headers)
    assert r.status_code==expected,(method,path,r.status_code,r.text)
    return r.json() if r.content else None
with httpx.Client(base_url=ROOT) as anon:
    call(anon,"GET","/admin/orders",expected=401)
    assert anon.post("/auth/login",json={"email":"admin@autowise.test","password":"DemoAdmin!2026"}).status_code==400
admin=client("admin@autowise.test"); customer=client("customer1@autowise.test")
call(customer,"GET","/admin/orders",expected=403)
page=call(customer,"GET","/my/orders")
assert page["totalCount"]>=20 and all(o["customerId"]=="20000000-0000-0000-0000-000000000001" for o in page["items"])
call(customer,"GET","/my/orders/30000000-0000-0000-0000-000000000002",expected=404)
call(admin,"POST","/auth/login",{"email":None,"password":None},expected=401)
body={"customerId":"20000000-0000-0000-0000-000000000001","carId":"car_34_3","dealerId":4,"totalVnd":1000000,"depositRequiredVnd":100000,"variant":"SMOKE"}
key=str(uuid.uuid4());o=call(admin,"POST","/admin/orders",body,key=key)
assert call(admin,"POST","/admin/orders",body,key=key)==o
call(admin,"POST","/admin/orders",dict(body,totalVnd=2000000),expected=409,key=key)
path="/admin/orders/"+o["id"]
call(admin,"POST",path+"/transitions",{"version":o["version"]-1,"status":"confirmed","reason":"smoke"},expected=409)
# Two simultaneous writes with the same version: exactly one may succeed.
csrf=admin.get("/auth/csrf").json()["token"]
def race():
    return admin.post(path+"/transitions",json={"version":o["version"],"status":"confirmed","reason":"smoke"},headers={"X-CSRF-TOKEN":csrf,"Idempotency-Key":str(uuid.uuid4())}).status_code
with concurrent.futures.ThreadPoolExecutor(2) as pool: assert sorted(pool.map(lambda _:race(),range(2)))==[200,409]
o=call(admin,"GET",path)
for status in ["preparing_vehicle","ready_for_handover"]:
    o=call(admin,"POST",path+"/transitions",{"version":o["version"],"status":status,"reason":"smoke"})
call(admin,"POST",path+"/transitions",{"version":o["version"],"status":"completed","reason":"smoke"},expected=422)
o=call(admin,"POST",path+"/payments",{"version":o["version"],"type":"receipt","amountVnd":1000000,"reference":"SMOKE-"+str(uuid.uuid4())})
assert o["netReceived"]==0
pid=o["payments"][-1]["id"]
o=call(admin,"POST",path+f"/payments/{pid}/confirm",{"version":o["version"]})
assert o["netReceived"]==1000000 and o["remainingVnd"]==0
call(admin,"POST",path+f"/payments/{pid}/confirm",{"version":o["version"]},expected=422)
o=call(admin,"PUT",path+"/delivery",{"version":o["version"],"plannedDate":"2026-10-02","actualHandoverAt":"2026-10-01T08:00:00Z","location":"Demo showroom","reason":"smoke"})
o=call(admin,"POST",path+"/transitions",{"version":o["version"],"status":"completed","reason":"smoke"})
assert o["status"]=="completed" and call(customer,"GET","/my/orders/"+o["id"])["status"]=="completed"
print("PASS: auth, CSRF, customer isolation, idempotency, concurrency, payments, delivery lifecycle")
