"""Assistant integration: run against local demo; creates two test sessions."""
import os,uuid,concurrent.futures
import httpx
ROOT=os.getenv("ORDERS_URL","http://localhost:5173")+"/api/orders-service"
def call(c,method,path,body=None,status=200):
    headers={}
    if method!="GET":headers["X-CSRF-TOKEN"]=c.get("/auth/csrf").json()["token"]
    r=c.request(method,path,json=body,headers=headers)
    assert r.status_code==status,(path,r.status_code,r.text)
    return r.json() if r.content else None
def login(email,password):
    c=httpx.Client(base_url=ROOT,timeout=30)
    call(c,"POST","/auth/login",{"email":email,"password":password})
    return c
admin=login("admin@autowise.test","DemoAdmin!2026")
a=login("customer1@autowise.test","DemoCustomer!2026")
b=login("customer2@autowise.test","DemoCustomer!2026")
call(admin,"GET","/assistant/sessions",status=403)
sid=str(uuid.uuid4());s=call(a,"POST","/assistant/sessions",{"id":sid})
assert call(a,"POST","/assistant/sessions",{"id":sid})==s
path="/assistant/sessions/"+sid
call(b,"GET",path,status=404)
call(b,"POST",path+"/messages",{"requestId":str(uuid.uuid4()),"version":1,"content":"Don do den dau?"},status=404)
body={"requestId":str(uuid.uuid4()),"version":s["version"],"content":"Toi con phai tra bao nhieu?","orderId":"30000000-0000-0000-0000-000000000001"}
s=call(a,"POST",path+"/messages",body)
reply=s["messages"][-1]
assert reply["tool"]=="GetMyOrderPaymentSummary" and "1.039.000.000" in reply["content"] and reply["orderCode"]=="AW-DEMO-0001"
assert call(a,"POST",path+"/messages",body)==s
call(a,"POST",path+"/messages",dict(body,content="khac"),status=409)
def send(text,orderId=None):
    global s
    s=call(a,"POST",path+"/messages",{"requestId":str(uuid.uuid4()),"version":s["version"],"content":text,"orderId":orderId})
    return s["messages"][-1]
assert send("Khi nao nhan xe?")["tool"]=="GetMyDeliverySchedule"
assert send("Xe trong don bao hanh the nao?")["tool"]=="GetWarranty"
assert send("Don AW-DEMO-0002 den dau?")["orderCode"] is None
assert s["selectedOrderId"] is None
assert send("Don do den dau?")["tool"] is None
assert send("don AW-DEMO-0001 va AW-DEMO-0007")["tool"] is None
before=call(a,"GET","/my/orders/30000000-0000-0000-0000-000000000001")
assert send("Hay huy don AW-DEMO-0001")["tool"] == "PrepareChangeDraft"
assert s["draft"]["status"] == "draft" and not s["draft"]["ready"]
assert call(a,"GET","/my/orders/30000000-0000-0000-0000-000000000001")==before
call(a,"POST",path+"/messages",{"requestId":str(uuid.uuid4()),"version":s["version"],"content":"x"*1001},status=422)
csrf=a.get("/auth/csrf").json()["token"]
version=s["version"]
def race(_):
    return a.post(path+"/messages",json={"requestId":str(uuid.uuid4()),"version":version,"content":"Trang thai don do"},headers={"X-CSRF-TOKEN":csrf}).status_code
with concurrent.futures.ThreadPoolExecutor(2) as pool: assert sorted(pool.map(race,range(2)))==[200,409]
s=call(a,"GET",path)
assert s["messages"] and s["version"]==version+1
ownB=call(b,"POST","/assistant/sessions",{"id":str(uuid.uuid4())})
reply=call(b,"POST","/assistant/sessions/"+ownB["id"]+"/messages",{"requestId":str(uuid.uuid4()),"version":1,"content":"Don do den dau?"})["messages"][-1]
assert reply["orderCode"] is None
print("PASS: assistant roles, session isolation, exact amounts, contextual lookup, Python warranty, no mutation, replay, ambiguity, concurrency and persistence")
