using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;

public class AssistantDraftTests
{
    sealed class Catalogue : ICommonCatalogue
    {
        public Task<CarSnapshot> GetCar(string id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<DealerSnapshot> GetDealer(long id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<WarrantySnapshot?> GetWarranty(string id,string brand,CancellationToken ct)=>throw new NotSupportedException();
    }
    static OrdersDb Open()=>new(new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options);
    [Theory]
    [InlineData("Đổi lịch ngày mai", null)]
    [InlineData("Đổi lịch 31/02/2027", null)]
    [InlineData("Đổi lịch 15/10/2027", "2027-10-15")]
    [InlineData("Đổi lịch 2027-10-15", "2027-10-15")]
    public void DatesAreExplicit(string text,string? expected)=>Assert.Equal(expected,DraftParser.Date(text)?.ToString("yyyy-MM-dd"));

    [ContextDatabaseFact]
    public async Task DraftLifecycleIsOwnedAtomicVersionedAndReplaySafe()
    {
        await using var db=Open();
        var user=new UserRecord {Email=$"draft-{Guid.NewGuid():N}@test.invalid",DisplayName="Draft test"};
        var other=new UserRecord {Email=$"draft-{Guid.NewGuid():N}@test.invalid",DisplayName="Other"};
        var order=new Order {CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),TotalVnd=1000000,CarName="Test car"};
        db.Users.AddRange(user,other); db.Orders.Add(OrderStore.Row(order)); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var catalogue=new Catalogue(); var tx=new JourneyTransactions(db);
        var actions=new AssistantDraftActions(db,tx,new CustomerAccountStore(db,catalogue,tx));
        var assistant=new OrderAssistant(db,catalogue,null,new(){ContextEnabled=true});
        var session=await assistant.Create(user.Id,Guid.NewGuid(),default);
        async Task Send(string text) { db.ChangeTracker.Clear(); session=await assistant.Send(session.Id,user.Id,new(Guid.NewGuid(),session.Version,text,order.Id),default); }
        DraftAction Input(string action,string? reason=null,DateOnly? date=null,string? time=null)=>new(Guid.NewGuid(),session.Version,session.Draft!.Id,session.Draft.Version,action,reason,date,time);
        async Task Act(DraftAction input) { db.ChangeTracker.Clear(); session=await actions.Act(session.Id,user.Id,input,default); }
        try
        {
            await Send("Tôi muốn đổi lịch ngày mai"); Assert.NotNull(session.Draft); Assert.False(session.Draft.Ready);
            await Assert.ThrowsAsync<BusinessRuleException>(()=>Act(Input("edit","Bận",new DateOnly(2027,10,15),"25:30")));
            Assert.Empty(await db.Changes.Where(x=>x.OrderId==order.Id).ToListAsync());
            await Assert.ThrowsAsync<BusinessRuleException>(()=>Act(Input("confirm")));
            await Send("đồng ý"); Assert.Empty(await db.Changes.Where(x=>x.OrderId==order.Id).ToListAsync());
            var edit=Input("edit","Bận công việc",new DateOnly(2027,10,15),"09:30"); await Act(edit);
            Assert.True(session.Draft!.Ready);
            await Assert.ThrowsAsync<VersionConflictException>(()=>Act(edit with {RequestId=Guid.NewGuid()}));
            db.ChangeTracker.Clear(); await Assert.ThrowsAsync<KeyNotFoundException>(()=>actions.Act(session.Id,other.Id,Input("confirm"),default));
            await using(var changed=Open()) {
                var row=await changed.Orders.SingleAsync(x=>x.Id==order.Id); order.Transition("confirmed","test","admin");
                row.Version=order.Version; row.Status=order.Status; row.Payload=JourneyTransactions.Pack(order); await changed.SaveChangesAsync();
            }
            await Assert.ThrowsAsync<VersionConflictException>(()=>Act(Input("confirm")));
            Assert.Empty(await db.Changes.Where(x=>x.OrderId==order.Id).ToListAsync());
            await Act(Input("edit","Bận công việc",new DateOnly(2027,10,15),"09:30"));
            Assert.Equal("confirmed",session.Draft!.OrderStatus);
            var confirm=Input("confirm");
            async Task<ChatSession> Race(DraftAction input) {
                await using var raced=Open(); var raceTx=new JourneyTransactions(raced);
                return await new AssistantDraftActions(raced,raceTx,new CustomerAccountStore(raced,catalogue,raceTx)).Act(session.Id,user.Id,input,default);
            }
            var racedResults=await Task.WhenAll(Race(confirm),Race(confirm with {RequestId=Guid.NewGuid()}));
            Assert.Equal(racedResults[0].Draft!.RequestId,racedResults[1].Draft!.RequestId);
            await Act(confirm);
            var result=session; await Act(confirm); Assert.Equal(result.Version,session.Version);
            await Act(confirm with {RequestId=Guid.NewGuid()}); Assert.Equal(result.Version,session.Version);
            var change=Assert.Single(await db.Changes.Where(x=>x.OrderId==order.Id).ToListAsync());
            Assert.Equal("pending",change.Status); Assert.Contains("15/10/2027",change.Reason); Assert.Contains("09:30",change.Reason);
            Assert.Equal(change.Id,session.Draft!.RequestId); Assert.Equal(change.Code,session.Draft.RequestCode);
            Assert.Equal("submitted",session.Draft.Status); Assert.Contains(session.Draft.Audit,x=>x.Action=="confirm");
            var unchanged=OrderStore.Read(await db.Orders.AsNoTracking().SingleAsync(x=>x.Id==order.Id));
            Assert.Equal(order.Version,unchanged.Version); Assert.Null(unchanged.PlannedDate); Assert.Equal(0,unchanged.NetReceived);
            await Assert.ThrowsAsync<BusinessRuleException>(()=>Send("Hủy đơn vì bận"));
            db.ChangeTracker.Clear(); await db.Changes.Where(x=>x.OrderId==order.Id).ExecuteDeleteAsync();
            await Send("Hủy đơn vì không còn nhu cầu"); await Act(Input("discard"));
            await Assert.ThrowsAsync<BusinessRuleException>(()=>Act(Input("confirm")));
            await Send("Hủy đơn vì không còn nhu cầu");
            db.ChangeTracker.Clear(); var record=await db.ChatSessions.SingleAsync(x=>x.Id==session.Id);
            var context=JourneyTransactions.Unpack<ConversationContext>(record.Context);
            record.Context=JourneyTransactions.Pack(context with {Drafts=context.Drafts.Select(x=>x.Id==session.Draft!.Id?x with {ExpiresAt=DateTimeOffset.UtcNow.AddMinutes(-1)}:x).ToList()});
            await db.SaveChangesAsync(); Assert.Equal("expired",(await assistant.Get(session.Id,user.Id,default)).Draft!.Status);
            await Assert.ThrowsAsync<BusinessRuleException>(()=>Act(Input("confirm")));
            Assert.Empty(await db.Changes.Where(x=>x.OrderId==order.Id).ToListAsync());
            await Send("Hủy đơn vì đổi kế hoạch");
            await Act(Input("confirm"));
            Assert.Equal("cancel",Assert.Single(await db.Changes.Where(x=>x.OrderId==order.Id).ToListAsync()).Type);
            db.ChangeTracker.Clear();
            await Assert.ThrowsAsync<BusinessRuleException>(()=>new CustomerAccountStore(db,catalogue,tx).Change(user.Id,new(order.Id,"cancel","duplicate"),Guid.NewGuid().ToString(),default));
            db.ChangeTracker.Clear(); await db.Changes.Where(x=>x.OrderId==order.Id).ExecuteDeleteAsync();
            await Send("Hủy đơn vì đổi kế hoạch");
            await using(var ended=Open()) {
                var row=await ended.Orders.SingleAsync(x=>x.Id==order.Id); order.Transition("cancelled","test","admin");
                row.Version=order.Version; row.Status=order.Status; row.Payload=JourneyTransactions.Pack(order); await ended.SaveChangesAsync();
            }
            await Assert.ThrowsAsync<BusinessRuleException>(()=>Act(Input("confirm")));
            Assert.Empty(await db.Changes.Where(x=>x.OrderId==order.Id).ToListAsync());
        }
        finally {
            db.ChangeTracker.Clear();
            await db.Changes.Where(x=>x.OrderId==order.Id).ExecuteDeleteAsync();
            await db.Requests.Where(x=>x.Key.StartsWith(user.Id.ToString())||x.Key.StartsWith(other.Id.ToString())).ExecuteDeleteAsync();
            await db.ChatSessions.Where(x=>x.UserId==user.Id).ExecuteDeleteAsync();
            await db.Orders.Where(x=>x.Id==order.Id).ExecuteDeleteAsync();
            await db.Users.Where(x=>x.Id==user.Id||x.Id==other.Id).ExecuteDeleteAsync();
        }
    }
}
