using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

public sealed class ContextDatabaseFactAttribute : FactAttribute
{
    public ContextDatabaseFactAttribute()
    {
        if(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE") == null)
            Skip="Set CONTEXT_TEST_DATABASE to opt into PostgreSQL context integration tests.";
    }
}

public class ContextDatabaseTests
{
    sealed class TitleHandler : HttpMessageHandler
    {
        public int Calls { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content=new StringContent("{\"title\":\"Tư vấn Honda CR-V\"}") });
        }
    }
    [ContextDatabaseFact]
    public async Task AiTitleIsOwnedPersistentAndGeneratedOnce()
    {
        await using var db=Open();
        var user=new UserRecord {Email=$"title-{Guid.NewGuid():N}@test.invalid",DisplayName="Title test"};
        db.Users.Add(user);await db.SaveChangesAsync();db.ChangeTracker.Clear();
        var orders=new OrderAssistant(db,new NoCatalogue());
        var handler=new TitleHandler();
        using var http=new HttpClient(handler){BaseAddress=new("http://ai.test/")};
        var service=new ConversationTitles(db,http);
        try {
            var session=await orders.Create(user.Id,Guid.NewGuid(),default);
            session=await orders.Send(session.Id,user.Id,new(Guid.NewGuid(),session.Version,"Đơn hàng của tôi",null),default);
            var named=await service.Generate(session.Id,user.Id,default);
            Assert.Equal("Tư vấn Honda CR-V",named.Title);
            Assert.Equal(session.Version,named.Version);
            db.ChangeTracker.Clear();
            Assert.Equal(named.Title,(await orders.Get(session.Id,user.Id,default)).Title);
            await service.Generate(session.Id,user.Id,default);
            Assert.Equal(1,handler.Calls);
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.Generate(session.Id,Guid.NewGuid(),default));
            using var listed=JsonDocument.Parse(JsonSerializer.Serialize(await orders.List(user.Id,default)));
            Assert.Equal("Tư vấn Honda CR-V",listed.RootElement[0].GetProperty("Title").GetString());
        } finally {
            await db.ChatSessions.Where(s=>s.UserId==user.Id).ExecuteDeleteAsync();
            await db.Users.Where(u=>u.Id==user.Id).ExecuteDeleteAsync();
        }
    }
    sealed class CatalogueHandler : HttpMessageHandler
    {
        public List<string> Bodies { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Bodies.Add(await request.Content!.ReadAsStringAsync(ct));
            return new(System.Net.HttpStatusCode.OK) { Content = new StringContent("{\"answer\":\"Honda CR-V\",\"contexts\":[{\"carId\":\"car_34_3\",\"displayName\":\"Honda CR-V\",\"description\":\"SUV catalogue description\"}]}") };
        }
    }
    [ContextDatabaseFact]
    public async Task CatalogueContextPersistsAndReplayDoesNotCallProviderAgain()
    {
        await using var db = Open();
        var user = new UserRecord { Email=$"catalogue-{Guid.NewGuid():N}@test.invalid", DisplayName="Catalogue test" };
        db.Users.Add(user); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var orders = new OrderAssistant(db, new NoCatalogue());
        var handler = new CatalogueHandler();
        using var http = new HttpClient(handler) { BaseAddress = new("http://catalogue.test/") };
        var service = new CatalogueAssistant(db, http, new("http://images.test/"));
        try {
            var session = await orders.Create(user.Id, Guid.NewGuid(), default);
            var input = new CatalogueChatInput(Guid.NewGuid(), session.Version, "Honda CR-V");
            session = await service.Send(session.Id, user.Id, input, default);
            db.ChangeTracker.Clear();
            var restored = await orders.Get(session.Id, user.Id, default);
            Assert.Equal("car_34_3", restored.Messages.Last().Contexts![0].CarId);
            Assert.True(restored.Messages.Last().Catalog);
            Assert.Equal("SUV catalogue description", restored.Messages.Last().Contexts![0].Description);
            await service.Send(session.Id, user.Id, input, default);
            Assert.Single(handler.Bodies);
            await Assert.ThrowsAsync<KeyNotFoundException>(() => service.Send(session.Id, Guid.NewGuid(), input, default));
            await Assert.ThrowsAsync<VersionConflictException>(() => service.Send(session.Id, user.Id, input with { RequestId=Guid.NewGuid() }, default));
            session = await service.Send(session.Id, user.Id, new(Guid.NewGuid(), restored.Version, "Xe đó giá bao nhiêu?"), default);
            Assert.Contains("car_34_3", handler.Bodies.Last());
            session = await service.Send(session.Id, user.Id, new(Guid.NewGuid(), session.Version, "Ảnh xe", "AQID", "image/png"), default);
            db.ChangeTracker.Clear();
            restored = await orders.Get(session.Id, user.Id, default);
            Assert.Equal("data:image/png;base64,AQID", restored.Messages[^2].ImageUrl);
            Assert.Equal(6, restored.Messages.Count);
        } finally {
            await db.ChatSessions.Where(s=>s.UserId==user.Id).ExecuteDeleteAsync();
            await db.Users.Where(u=>u.Id==user.Id).ExecuteDeleteAsync();
        }
    }
    [ContextDatabaseFact]
    public async Task AsksForAnOrderThenUsesOwnedConversationContext()
    {
        await using var db=Open();
        var user=new UserRecord {Email=$"automatic-{Guid.NewGuid():N}@test.invalid",DisplayName="Automatic test"};
        var other=new UserRecord {Email=$"automatic-{Guid.NewGuid():N}@test.invalid",DisplayName="Other"};
        var first=new Order {CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),CarName="Single car",TotalVnd=1000000};
        var foreign=new Order {CustomerId=other.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),CarName="Foreign secret"};
        var second=new Order {CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),CarName="Second car"};
        OrderRecord Record(Order o)=>new(){Id=o.Id,CustomerId=o.CustomerId,Code=o.Code,Version=1,CreatedAt=o.CreatedAt,Payload=JsonSerializer.Serialize(o,OrderStore.Json)};
        db.Users.AddRange(user,other);db.Orders.AddRange(Record(first),Record(foreign));await db.SaveChangesAsync();db.ChangeTracker.Clear();
        var service=new OrderAssistant(db,new NoCatalogue(),null,new BedrockOptions {ContextEnabled=true});
        try
        {
            var single=await service.Create(user.Id,Guid.NewGuid(),default);
            single=await service.Send(single.Id,user.Id,new(Guid.NewGuid(),single.Version,"Đơn hàng của tôi đến đâu rồi?",null),default);
            Assert.Null(single.Messages.Last().OrderCode);
            Assert.Contains(first.Code,single.Messages.Last().Content);
            single=await service.Send(single.Id,user.Id,new(Guid.NewGuid(),single.Version,first.Code,null),default);
            Assert.Equal(first.Code,single.Messages.Last().OrderCode);
            single=await service.Send(single.Id,user.Id,new(Guid.NewGuid(),single.Version,"Còn phải trả bao nhiêu?",null),default);
            Assert.Equal("GetMyOrderPaymentSummary",single.Messages.Last().Tool);
            var legacy=new OrderAssistant(db,new NoCatalogue(),null,new BedrockOptions {ContextEnabled=false});
            var legacySession=await legacy.Create(user.Id,Guid.NewGuid(),default);
            legacySession=await legacy.Send(legacySession.Id,user.Id,new(Guid.NewGuid(),legacySession.Version,"Khi nào nhận xe?",null),default);
            Assert.Null(legacySession.Messages.Last().OrderCode);
            legacySession=await legacy.Send(legacySession.Id,user.Id,new(Guid.NewGuid(),legacySession.Version,first.Code,null),default);
            Assert.Equal(first.Code,legacySession.Messages.Last().OrderCode);
            db.Orders.Add(Record(second));await db.SaveChangesAsync();db.ChangeTracker.Clear();
            var multiple=await service.Create(user.Id,Guid.NewGuid(),default);
            multiple=await service.Send(multiple.Id,user.Id,new(Guid.NewGuid(),multiple.Version,"Thanh toán đơn hàng của tôi thế nào?",null),default);
            Assert.Null(multiple.SelectedOrderId);
            Assert.Contains(first.Code,multiple.Messages.Last().Content);
            Assert.Contains(second.Code,multiple.Messages.Last().Content);
            Assert.DoesNotContain(foreign.Code,multiple.Messages.Last().Content);
            multiple=await service.Send(multiple.Id,user.Id,new(Guid.NewGuid(),multiple.Version,second.Code,null),default);
            Assert.Equal(second.Code,multiple.Messages.Last().OrderCode);
            Assert.Equal("GetMyOrderPaymentSummary",multiple.Messages.Last().Tool);
        }
        finally
        {
            await db.ChatSessions.Where(s=>s.UserId==user.Id).ExecuteDeleteAsync();
            await db.Orders.Where(o=>o.CustomerId==user.Id||o.CustomerId==other.Id).ExecuteDeleteAsync();
            await db.Users.Where(u=>u.Id==user.Id||u.Id==other.Id).ExecuteDeleteAsync();
        }
    }
    sealed class NoCatalogue : ICommonCatalogue
    {
        public Task<CarSnapshot> GetCar(string id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<DealerSnapshot> GetDealer(long id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<WarrantySnapshot?> GetWarranty(string id,string brand,CancellationToken ct)=>throw new NotSupportedException();
    }

    sealed class FailSave : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data,InterceptionResult<int> result,CancellationToken ct=default)
            => throw new InvalidOperationException("Injected save failure");
    }
    static OrdersDb Open(IInterceptor? interceptor=null)
    {
        var builder=new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE"),
            np=>np.MigrationsHistoryTable("__EFMigrationsHistory","orders_service"));
        if(interceptor!=null) builder.AddInterceptors(interceptor);
        return new(builder.Options);
    }

    [ContextDatabaseFact]
    public async Task ContextIsAtomicFreshOwnedAndPersistent()
    {
        await using var db=Open();
        var user=new UserRecord {Email=$"context-{Guid.NewGuid():N}@test.invalid",DisplayName="Context test"};
        var other=new UserRecord {Email=$"context-{Guid.NewGuid():N}@test.invalid",DisplayName="Other test"};
        var first=new Order {CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),TotalVnd=1000000,CarName="Test car"};
        var second=new Order {CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),TotalVnd=2000000,CarName="Test car 2"};
        var foreign=new Order {CustomerId=other.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),TotalVnd=3000000,CarName="Foreign secret"};
        OrderRecord Record(Order order)=>new(){Id=order.Id,Code=order.Code,CustomerId=order.CustomerId,Version=1,CreatedAt=order.CreatedAt,Payload=JsonSerializer.Serialize(order,OrderStore.Json)};
        db.Users.AddRange(user,other);db.Orders.AddRange(Record(first),Record(second),Record(foreign));
        await db.SaveChangesAsync();db.ChangeTracker.Clear();
        var options=new BedrockOptions {ContextEnabled=true};
        var service=new OrderAssistant(db,new NoCatalogue(),null,options);
        var session=await service.Create(user.Id,Guid.NewGuid(),default);
        async Task<ChatMessage> Send(string question,Guid? orderId=null)
        {
            session=await service.Send(session.Id,user.Id,new(Guid.NewGuid(),session.Version,question,orderId),default);
            return session.Messages.Last();
        }
        try
        {
            var legacyId=Guid.NewGuid();
            await using(var legacyDb=Open())
            {
                legacyDb.ChatSessions.Add(new(){Id=legacyId,UserId=user.Id,SelectedOrderId=first.Id,Context="{}",Version=2,
                    Payload=JsonSerializer.Serialize(new[]{new ChatTurn(Guid.NewGuid(),"legacy",[new("assistant","Old payment snapshot",DateTimeOffset.UtcNow,"GetMyOrderPaymentSummary")])},OrderStore.Json)});
                await legacyDb.SaveChangesAsync();
            }
            var legacyReply=await service.Send(legacyId,user.Id,new(Guid.NewGuid(),2,"Còn phải trả bao nhiêu?",null),default);
            Assert.Equal(first.Code,legacyReply.Messages.Last().OrderCode);
            Assert.Equal("GetMyOrderPaymentSummary",legacyReply.Messages.Last().Tool);
            var limitId=Guid.NewGuid();
            await using(var limitDb=Open())
            {
                limitDb.ChatSessions.Add(new(){Id=limitId,UserId=user.Id,Payload=JsonSerializer.Serialize(Enumerable.Range(0,100)
                    .Select(i=>new ChatTurn(Guid.NewGuid(),"limit",[new("user","test",DateTimeOffset.UtcNow)])).ToArray(),OrderStore.Json)});
                await limitDb.SaveChangesAsync();
            }
            await Assert.ThrowsAsync<BusinessRuleException>(()=>service.Send(limitId,user.Id,new(Guid.NewGuid(),1,"test",null),default));
            Assert.Null((await Send("Còn phải trả bao nhiêu?")).Tool);
            Assert.Equal("GetMyOrderPaymentSummary",(await Send(first.Code)).Tool);
            Assert.Null((await Send($"Đơn {first.Code} còn phải trả bao nhiêu?",second.Id)).Tool);
            Assert.Equal("GetMyOrderPaymentSummary",(await Send(first.Code)).Tool);
            Assert.Equal("GetMyDeliverySchedule",(await Send($"Khi nào nhận xe đơn {first.Code}?")).Tool);
            Assert.Equal("GetMyDeliverySchedule",(await Send($"Còn đơn {second.Code} thì sao?")).Tool);
            Assert.Equal(first.Code,(await Send("Đơn trước còn phải trả bao nhiêu?",second.Id)).OrderCode);
            // New instance simulates reopening the session, with fresh DB reads.
            await using(var changed=Open())
            {
                var row=await changed.Orders.SingleAsync(x=>x.Id==first.Id);
                first.TotalVnd=1500000;row.Payload=JsonSerializer.Serialize(first,OrderStore.Json);await changed.SaveChangesAsync();
            }
            Assert.Contains("1.500.000",(await Send("Còn phải trả bao nhiêu?")).Content);
            var request=new ChatInput(Guid.NewGuid(),session.Version,"Trạng thái đơn này",null);
            var result=await service.Send(session.Id,user.Id,request,default);
            var replay=await service.Send(session.Id,user.Id,request,default);
            Assert.Equal(result.Version,replay.Version);
            await Assert.ThrowsAsync<VersionConflictException>(()=>service.Send(session.Id,user.Id,request with {Content="khác"},default));
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.Get(session.Id,other.Id,default));
            session=result;
            var denied=await Send($"Đơn {foreign.Code} còn phải trả bao nhiêu?");
            Assert.Null(denied.OrderCode);Assert.DoesNotContain("Foreign secret",denied.Content);
            Assert.Null((await Send("Còn phải trả bao nhiêu?")).Tool);
            Assert.Equal("GetMyOrderPaymentSummary",(await Send(first.Code)).Tool);
            // An invalid explicit selection must not fall back to current order.
            Assert.Null((await Send("Còn phải trả bao nhiêu?",foreign.Id)).OrderCode);
            await using var reopened=Open();
            var saved=await reopened.ChatSessions.AsNoTracking().SingleAsync(x=>x.Id==session.Id);
            Assert.Contains(first.Id.ToString(),saved.Context);
            Assert.DoesNotContain(foreign.Id.ToString(),saved.Context);
            Assert.Equal(session.Version,saved.Version);
            // Independent DB contexts simulate separate HTTP requests competing
            // for the same session/version; exactly one may persist context.
            async Task<bool> Race(string question)
            {
                await using var concurrent=Open();
                var agent=new OrderAssistant(concurrent,new NoCatalogue(),null,options);
                try {await agent.Send(session.Id,user.Id,new(Guid.NewGuid(),session.Version,question,first.Id),default);return true;}
                catch(VersionConflictException) {return false;}
            }
            var results=await Task.WhenAll(Race("Khi nào nhận xe?"),Race("Còn phải trả bao nhiêu?"));
            Assert.Single(results,x=>x);
            reopened.ChangeTracker.Clear();
            var afterRace=await reopened.ChatSessions.AsNoTracking().SingleAsync(x=>x.Id==session.Id);
            Assert.Equal(saved.Version+1,afterRace.Version);
            var persisted=JsonSerializer.Deserialize<ConversationContext>(afterRace.Context,OrderStore.Json)!;
            var last=JsonSerializer.Deserialize<List<ChatTurn>>(afterRace.Payload,OrderStore.Json)!.Last().Messages.Last();
            Assert.Equal(last.Tool=="GetMyDeliverySchedule"?"delivery":"payment",persisted.LastBusinessIntent);
            await using(var failing=Open(new FailSave()))
            {
                var agent=new OrderAssistant(failing,new NoCatalogue(),null,options);
                await Assert.ThrowsAsync<InvalidOperationException>(()=>agent.Send(session.Id,user.Id,new(Guid.NewGuid(),afterRace.Version,"Khi nào nhận xe?",second.Id),default));
            }
            var afterFailure=await reopened.ChatSessions.AsNoTracking().SingleAsync(x=>x.Id==session.Id);
            Assert.Equal(afterRace.Version,afterFailure.Version);
            Assert.Equal(afterRace.Context,afterFailure.Context);
            Assert.Equal(afterRace.Payload,afterFailure.Payload);
        }
        finally
        {
            db.ChangeTracker.Clear();
            await db.ChatSessions.Where(x=>x.UserId==user.Id || x.UserId==other.Id).ExecuteDeleteAsync();
            await db.Orders.Where(x=>x.CustomerId==user.Id || x.CustomerId==other.Id).ExecuteDeleteAsync();
            await db.Users.Where(x=>x.Id==user.Id || x.Id==other.Id).ExecuteDeleteAsync();
        }
    }
}
