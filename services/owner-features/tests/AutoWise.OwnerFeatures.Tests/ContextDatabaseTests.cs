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
