using System.Net;
using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;

public class UnifiedAssistantTests
{
    sealed class Handler(string carId="edge", bool uncertain=false) : HttpMessageHandler
    {
        public int Calls;
        public string? Verified;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            var path=request.RequestUri!.AbsolutePath;
            var body=await request.Content!.ReadAsStringAsync(ct);
            string response;
            if(path=="/api/chat/understand") {
                using var json=JsonDocument.Parse(body);
                response=JsonSerializer.Serialize(new {question=json.RootElement.GetProperty("question").GetString(),route="orders",needsClarification=false,clarification=(string?)null});
            } else if(path=="/search/image") {
                Assert.Contains("\r\n5\r\n",body);
                response=JsonSerializer.Serialize(new {uncertain,results=new[]{new {car_id=carId,display_name="Ford Edge",similarity=.87}}});
            }
            else if(path=="/api/chat/compose") {
                using var json=JsonDocument.Parse(body);
                Verified=json.RootElement.GetProperty("verifiedData").GetProperty("retrievedAnswer").GetString();
                response="""{"answer":"Kết quả đã đối chiếu.","grounded":true,"status":"partial","evidence":[{"contextId":"tool:0","content":"Nguồn công cụ","section":"image"}],"citations":[{"contextId":"tool:0","title":"Đơn của bạn"}]}""";
            } else throw new InvalidOperationException(path);
            return new(HttpStatusCode.OK){Content=new StringContent(response)};
        }
    }
    sealed class NoCatalogue : ICommonCatalogue
    {
        public Task<CarSnapshot> GetCar(string id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<DealerSnapshot> GetDealer(long id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<WarrantySnapshot?> GetWarranty(string id,string brand,CancellationToken ct)=>throw new NotSupportedException();
    }
    [ContextDatabaseFact]
    public async Task ImageOrderTurnUsesAuthenticatedToolsPreservesSourcesAndReplaysBeforeModelCalls()
    {
        var options=new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options;
        await using var db=new OrdersDb(options);
        var owner=new UserRecord{Email=$"unified-{Guid.NewGuid():N}@test.invalid",DisplayName="Owner"};
        var other=new UserRecord{Email=$"unified-{Guid.NewGuid():N}@test.invalid",DisplayName="Other"};
        var order=new Order{CustomerId=owner.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),CarId="edge",CarName="Ford Edge"};
        var foreign=new Order{CustomerId=other.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),CarId="foreign",CarName="PRIVATE SECRET"};
        OrderRecord Record(Order value)=>new(){Id=value.Id,CustomerId=value.CustomerId,Code=value.Code,Version=1,CreatedAt=value.CreatedAt,Payload=JsonSerializer.Serialize(value,OrderStore.Json)};
        db.Users.AddRange(owner,other);db.Orders.AddRange(Record(order),Record(foreign));await db.SaveChangesAsync();db.ChangeTracker.Clear();
        using var handler=new Handler();
        using var http=new HttpClient(handler){BaseAddress=new("http://python.test/")};
        var natural=new NaturalAnswers(http);
        var orders=new OrderAssistant(db,new NoCatalogue(),naturalAnswers:natural);
        var catalogue=new CatalogueAssistant(db,http,new("http://images.test/"));
        var unified=new UnifiedAssistant(db,http,new("http://images.test/"),orders,catalogue);
        try {
            var session=await orders.Create(owner.Id,Guid.NewGuid(),default);
            var input=new UnifiedChatInput(Guid.NewGuid(),session.Version,"Xe trong ảnh có phải xe đơn "+order.Code+" không?",ImageBase64:"AQID",MimeType:"image/png");
            session=await unified.Send(session.Id,owner.Id,input,default);
            Assert.Contains("Mẫu xe khớp",handler.Verified);
            Assert.Contains("VIN",handler.Verified);
            Assert.Equal(3,handler.Calls);
            var replay=await unified.Send(session.Id,owner.Id,input,default);
            Assert.Equal(session.Version,replay.Version);Assert.Equal(3,handler.Calls);
            Assert.True(session.Messages.Last().Grounded);
            Assert.Single(session.Messages.Last().Evidence!);Assert.Single(session.Messages.Last().Citations!);
            db.ChangeTracker.Clear();
            var persisted=await orders.Get(session.Id,owner.Id,default);
            Assert.Equal("partial",persisted.Messages.Last().Status);
            Assert.Equal($"/api/orders-service/assistant/sessions/{session.Id}/attachments/{input.RequestId}",persisted.Messages[^2].ImageUrl);
            Assert.DoesNotContain("base64",(await db.ChatSessions.AsNoTracking().SingleAsync(s=>s.Id==session.Id)).Payload);
            var attachment=await db.ChatAttachments.AsNoTracking().SingleAsync(a=>a.Id==input.RequestId);
            Assert.Equal(new byte[]{1,2,3},attachment.Data);
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>unified.Send(session.Id,other.Id,input,default));
            await Assert.ThrowsAsync<VersionConflictException>(()=>unified.Send(session.Id,owner.Id,input with{Content="changed"},default));
            var second=await orders.Create(owner.Id,Guid.NewGuid(),default);
            await unified.Send(second.Id,owner.Id,input with{RequestId=Guid.NewGuid(),Version=second.Version,Content="Xe ảnh có phải đơn "+foreign.Code+"?"},default);
            Assert.DoesNotContain("PRIVATE SECRET",handler.Verified);
            Assert.DoesNotContain("Mẫu xe khớp",handler.Verified);
            foreach(var (carId,uncertain) in new[]{("different",false),("edge",true)}) {
                using var imageHandler=new Handler(carId,uncertain);
                using var imageHttp=new HttpClient(imageHandler){BaseAddress=new("http://python.test/")};
                var imageOrders=new OrderAssistant(db,new NoCatalogue(),naturalAnswers:new NaturalAnswers(imageHttp));
                var imageCatalogue=new CatalogueAssistant(db,imageHttp,new("http://images.test/"));
                var imageAgent=new UnifiedAssistant(db,imageHttp,new("http://images.test/"),imageOrders,imageCatalogue);
                var imageSession=await imageOrders.Create(owner.Id,Guid.NewGuid(),default);
                var result=await imageAgent.Send(imageSession.Id,owner.Id,input with{RequestId=Guid.NewGuid(),Version=imageSession.Version},default);
                Assert.Contains(uncertain ? "chưa chắc chắn" : "Mẫu xe không khớp",imageHandler.Verified);
                Assert.Equal(uncertain,result.Messages.Last().Uncertain);
            }
        } finally {
            db.ChangeTracker.Clear();
            await db.ChatSessions.Where(s=>s.UserId==owner.Id||s.UserId==other.Id).ExecuteDeleteAsync();
            await db.Orders.Where(o=>o.CustomerId==owner.Id||o.CustomerId==other.Id).ExecuteDeleteAsync();
            await db.Users.Where(u=>u.Id==owner.Id||u.Id==other.Id).ExecuteDeleteAsync();
        }
    }
}
