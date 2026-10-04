using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;

public class OrderProgressDatabaseTests
{
    sealed class NoCatalogue : ICommonCatalogue
    {
        public Task<CarSnapshot> GetCar(string id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<DealerSnapshot> GetDealer(long id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<WarrantySnapshot?> GetWarranty(string id,string brand,CancellationToken ct)=>throw new NotSupportedException();
    }
    static OrdersDb Open()=>new(new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options);

    [ContextDatabaseFact]
    public async Task ProgressAndPaymentShareFreshOwnedSnapshotWithSafeHistoryAndReplay()
    {
        await using var db=Open();
        var user=new UserRecord {Email=$"progress-{Guid.NewGuid():N}@test.invalid",DisplayName="Progress test"};
        var other=new UserRecord {Email=$"progress-{Guid.NewGuid():N}@test.invalid",DisplayName="Other"};
        var order=new Order {CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),TotalVnd=1000000,CarName="Test car"};
        order.Record("created","PRIVATE_CREATED","PRIVATE_ACTOR");
        order.Transition("confirmed","PRIVATE_REASON","PRIVATE_ACTOR");
        order.Transition("preparing_vehicle","PRIVATE_REASON","PRIVATE_ACTOR");
        order.UpdateCustomerWaitingReason("Chờ đại lý kiểm tra xe.","PRIVATE_NOTE","PRIVATE_ACTOR");
        order.Schedule(new DateOnly(2026,10,15),null,"Đại lý","PRIVATE_SCHEDULE","PRIVATE_ACTOR",true);
        var foreign=new Order {CustomerId=other.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),CustomerWaitingReason="FOREIGN_SECRET"};
        db.Users.AddRange(user,other);db.Orders.AddRange(OrderStore.Row(order),OrderStore.Row(foreign));
        await db.SaveChangesAsync();db.ChangeTracker.Clear();
        var service=new OrderAssistant(db,new NoCatalogue(),null,new(){ContextEnabled=true});
        var session=await service.Create(user.Id,Guid.NewGuid(),default);
        async Task<ChatMessage> Send(string question,Guid? id=null)
        {
            db.ChangeTracker.Clear();
            session=await service.Send(session.Id,user.Id,new(Guid.NewGuid(),session.Version,question,id),default);
            return session.Messages.Last();
        }
        try
        {
            var reply=await Send("Tiến độ và còn phải trả bao nhiêu?",order.Id);
            Assert.Equal(new[]{"status","payment"},reply.Sections!.Select(s=>s.Topic));
            var progress=reply.Sections![0].Progress!;
            Assert.Equal("preparing_vehicle",progress.Status);Assert.Equal("confirmed",progress.Schedule.State);
            Assert.Equal("Chờ đại lý kiểm tra xe.",progress.WaitingReason);
            Assert.DoesNotContain("PRIVATE",JsonSerializer.Serialize(reply,OrderStore.Json));
            Assert.Contains("1.000.000",reply.Sections[1].Content);
            var store=new OrderStore(db,new NoCatalogue());
            var customerOrder=await store.Get(order.Id,user.Id,default);
            Assert.DoesNotContain("PRIVATE_NOTE",JsonSerializer.Serialize(customerOrder,OrderStore.Json));
            var customerList=await store.List(user.Id,null,null,1,10,false,default);
            Assert.DoesNotContain("PRIVATE_NOTE",JsonSerializer.Serialize(customerList,OrderStore.Json));
            var adminOrder=await store.Get(order.Id,null,default);
            Assert.Contains(adminOrder!.History,e=>e.Action=="progress_note" && e.Detail=="PRIVATE_NOTE");
            Assert.All(reply.Sections,s=>{Assert.NotEqual(default,s.RetrievedAt);Assert.Equal("/account/orders/"+order.Id,s.DetailUrl);});
            await using(var changed=Open()) {
                var record=await changed.Orders.SingleAsync(o=>o.Id==order.Id);
                order.Schedule(new DateOnly(2026,10,16),null,"Đại lý mới","audit","admin");
                order.Transition("ready_for_handover","audit","admin");
                order.TotalVnd=1500000;
                record.Payload=JsonSerializer.Serialize(order,OrderStore.Json);record.Status=order.Status;record.Version=order.Version;
                await changed.SaveChangesAsync();
            }
            reply=await Send("Tiến độ và còn phải trả bao nhiêu?");
            Assert.Equal("ready_for_handover",reply.Sections![0].Progress!.Status);
            Assert.Equal("planned",reply.Sections[0].Progress!.Schedule.State);
            Assert.Null(reply.Sections[0].Progress!.WaitingReason);
            Assert.Equal(new DateOnly(2026,10,16),reply.Sections[0].Progress!.Schedule.PlannedDate);
            Assert.Contains("1.500.000",reply.Sections[1].Content);
            var request=new ChatInput(Guid.NewGuid(),session.Version,"Tôi cần làm gì tiếp?",null);
            session=await service.Send(session.Id,user.Id,request,default);
            Assert.Equal("GetMyOrderProgress",session.Messages.Last().Tool);
            var replay=await service.Send(session.Id,user.Id,request,default);
            Assert.Equal(session.Version,replay.Version);Assert.Equal(session.Messages.Count,replay.Messages.Count);
            Assert.NotNull((await service.Get(session.Id,user.Id,default)).Messages.Last().Sections![0].Progress);
            reply=await Send($"Tiến độ đơn {foreign.Code}?");
            Assert.Null(reply.Sections);Assert.DoesNotContain("FOREIGN_SECRET",reply.Content);
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.Get(session.Id,other.Id,default));
        }
        finally
        {
            db.ChangeTracker.Clear();
            await db.ChatSessions.Where(s=>s.UserId==user.Id || s.UserId==other.Id).ExecuteDeleteAsync();
            await db.Orders.Where(s=>s.CustomerId==user.Id || s.CustomerId==other.Id).ExecuteDeleteAsync();
            await db.Users.Where(s=>s.Id==user.Id || s.Id==other.Id).ExecuteDeleteAsync();
        }
    }
}
