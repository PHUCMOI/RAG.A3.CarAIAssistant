"""Restart local demo and verify additive seeds preserve counts and edited records."""
import json,subprocess,time,httpx
sql='''SELECT jsonb_build_object(
'requests',(SELECT count(*) FROM orders_service.purchase_requests),
'orders',(SELECT count(*) FROM orders_service.orders),
'slots',(SELECT count(*) FROM orders_service.appointment_slots),
'appointments',(SELECT count(*) FROM orders_service.appointments),
'changes',(SELECT count(*) FROM orders_service.order_change_requests),
'notices',(SELECT count(*) FROM orders_service.notifications),
'users',(SELECT jsonb_agg(jsonb_build_object('id',"Id",'name',"DisplayName",'phone',"Phone",'version',"ProfileVersion",'stamp',"SecurityVersion") ORDER BY "Id") FROM orders_service.users),
'requestsData',(SELECT jsonb_agg(jsonb_build_object('id',"Id",'status',"Status",'version',"Version",'order',"OrderId") ORDER BY "Id") FROM orders_service.purchase_requests));'''
def snapshot():
    result=subprocess.run(['docker','compose','exec','-T','postgres','psql','-U','car_rag','-d','car_rag','-At'],input=sql,text=True,capture_output=True,check=True)
    return json.loads(result.stdout)
before=snapshot()
subprocess.run(['docker','compose','restart','orders-api'],check=True)
deadline=time.monotonic()+90
while time.monotonic()<deadline:
    try:
        if httpx.get('http://localhost:5090/api/orders-service/health',timeout=3).status_code==200:break
    except httpx.HTTPError:pass
    time.sleep(.5)
else:raise AssertionError('Orders API did not become ready after restart')
assert snapshot()==before,'Restart changed seeded records or edited account/request data'
print('PASS: restart preserves business counts, edited profile/security versions, request state and order links')
