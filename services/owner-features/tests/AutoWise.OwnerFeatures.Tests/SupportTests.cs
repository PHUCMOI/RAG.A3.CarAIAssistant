using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;
public class SupportTests
{
    sealed class Catalogue : ICommonCatalogue
    {
        public Task<CarSnapshot> GetCar(string id,CancellationToken ct)=>throw new HttpRequestException();
        public Task<DealerSnapshot> GetDealer(long id,CancellationToken ct)=>throw new HttpRequestException();
        public Task<WarrantySnapshot?> GetWarranty(string id,string brand,CancellationToken ct)=>throw new HttpRequestException();
    }
    static OrdersDb Open()=>new(new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options);
    [Theory]
    [InlineData("new","accept",true,"in_progress")]
    [InlineData("in_progress","resolve",true,"resolved")]
    [InlineData("resolved","reply",false,"in_progress")]
    [InlineData("resolved","close",true,"closed")]
    public void ValidTransitions(string status,string action,bool admin,string expected)=>Assert.Equal(expected,SupportRules.Transition(status,action,admin));
    [Fact]
    public void ClosedAndInvalidActionsRejectAndSecretsAreRedacted()
    {
        Assert.Throws<BusinessRuleException>(()=>SupportRules.Transition("closed","reply",false));
        Assert.Throws<BusinessRuleException>(()=>SupportRules.Transition("new","resolve",true));
        Assert.Throws<BusinessRuleException>(()=>SupportRules.Transition("new","accept",false));
        var text=SupportRules.Clean("password=SECRET123 OTP 123456 bearer TOKEN123 sk-SECRETKEY");
        Assert.DoesNotContain("SECRET123",text);Assert.DoesNotContain("123456",text);Assert.DoesNotContain("TOKEN123",text);Assert.DoesNotContain("SECRETKEY",text);
    }
    [ContextDatabaseFact]
    public async Task DraftTicketsAreAtomicOwnedPrivateAndVersioned()
    {
        await using var db=Open();
        var user=new UserRecord{Email=$"support-{Guid.NewGuid():N}@test.invalid",DisplayName="Customer"};
        var admin=new UserRecord{Email=$"support-{Guid.NewGuid():N}@test.invalid",DisplayName="Admin",Role="Admin"};
        var other=new UserRecord{Email=$"support-{Guid.NewGuid():N}@test.invalid",DisplayName="Other"};
        var order=new Order{CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant()};
        order.AddPayment("receipt",1000,"SUPPORT-R",null,"test");
        var foreign=new Order{CustomerId=other.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant()};
        db.Users.AddRange(user,admin,other);db.Orders.AddRange(OrderStore.Row(order),OrderStore.Row(foreign));await db.SaveChangesAsync();db.ChangeTracker.Clear();
        var change=new ChangeRecord{CustomerId=user.Id,OrderId=order.Id,Reason="Own request"};
        var foreignChange=new ChangeRecord{CustomerId=other.Id,OrderId=foreign.Id,Reason="Foreign request"};
        db.Changes.AddRange(change,foreignChange);await db.SaveChangesAsync();db.ChangeTracker.Clear();
        var catalogue=new Catalogue();var tx=new JourneyTransactions(db);var store=new SupportStore(db,tx);var assistant=new OrderAssistant(db,catalogue,null,new(){ContextEnabled=true});
        var actions=new AssistantDraftActions(db,tx,new CustomerAccountStore(db,catalogue,tx));var session=await assistant.Create(user.Id,Guid.NewGuid(),default);
        async Task Send(string text,Guid? linked=null){db.ChangeTracker.Clear();session=await assistant.Send(session.Id,user.Id,new(Guid.NewGuid(),session.Version,text,linked),default);}
        DraftAction Input(string action,string? summary=null,Guid? linked=null,Guid? payment=null)=>new(Guid.NewGuid(),session.Version,session.Draft!.Id,session.Draft.Version,action,summary,Subject:"Kiểm tra chuyển tiền",LinkedOrderId:linked,PaymentId:payment);
        async Task Act(DraftAction input){db.ChangeTracker.Clear();session=await actions.Act(session.Id,user.Id,input,default);}
        try {
            await Send("Tôi muốn gặp nhân viên");Assert.Equal("support",session.Draft!.Type);Assert.Equal(Guid.Empty,session.Draft.OrderId);
            await Assert.ThrowsAsync<BusinessRuleException>(()=>Act(Input("confirm")));Assert.Empty(await db.SupportTickets.Where(x=>x.CustomerId==user.Id).ToListAsync());
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>Act(Input("edit","Vấn đề",foreign.Id)));
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>store.ValidateLinks(user.Id,order.Id,Guid.NewGuid(),null,default));
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>store.ValidateLinks(user.Id,order.Id,null,foreignChange.Id,default));
            await store.ValidateLinks(user.Id,order.Id,order.Payments[0].Id,change.Id,default);
            await Act(Input("edit","Nhờ kiểm tra. password=SECRET123 OTP 123456"));Assert.DoesNotContain("SECRET123",session.Draft!.Reason);
            var confirm=Input("confirm");
            async Task<ChatSession> Race(DraftAction input){await using var raced=Open();var rt=new JourneyTransactions(raced);return await new AssistantDraftActions(raced,rt,new CustomerAccountStore(raced,catalogue,rt)).Act(session.Id,user.Id,input,default);}
            var results=await Task.WhenAll(Race(confirm),Race(confirm with{RequestId=Guid.NewGuid()}));Assert.Equal(results[0].Draft!.RequestId,results[1].Draft!.RequestId);
            await Act(confirm);var id=session.Draft!.RequestId!.Value;Assert.Single(await db.SupportTickets.Where(x=>x.CustomerId==user.Id).ToListAsync());
            var ticket=await store.Get(id,user.Id,1,20,default);Assert.Equal("new",ticket.Status);Assert.Null(ticket.OrderId);Assert.DoesNotContain("SECRET123",ticket.Summary);
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>store.Get(id,other.Id,1,20,default));
            db.ChangeTracker.Clear();ticket=await store.Act(id,admin.Id,new(ticket.Version,"accept"),Guid.NewGuid().ToString(),default);Assert.Equal(admin.Id,ticket.AssignedTo);
            db.ChangeTracker.Clear();var internalInput=new TicketReplyInput(ticket.Version,"INTERNAL_ONLY",true);var key=Guid.NewGuid().ToString();ticket=await store.Reply(id,admin.Id,true,internalInput,key,default);
            db.ChangeTracker.Clear();var replay=await store.Reply(id,admin.Id,true,internalInput,key,default);Assert.Equal(ticket.Version,replay.Version);
            Assert.Contains(ticket.Replies.Items,x=>x.Internal);var publicView=await store.Get(id,user.Id,1,20,default);Assert.Empty(publicView.Replies.Items);Assert.DoesNotContain("INTERNAL_ONLY",JsonSerializer.Serialize(publicView,OrderStore.Json));
            Assert.False(await db.NotificationEvents.AnyAsync(x=>x.UserId==user.Id&&x.Type=="support_reply"));
            db.ChangeTracker.Clear();await Assert.ThrowsAsync<BusinessRuleException>(()=>store.Reply(id,user.Id,false,new(publicView.Version,"hack",true),Guid.NewGuid().ToString(),default));
            db.ChangeTracker.Clear();ticket=await store.Reply(id,admin.Id,true,new(publicView.Version,"Đang kiểm tra khoản chuyển."),Guid.NewGuid().ToString(),default);
            Assert.Single(await db.NotificationEvents.Where(x=>x.UserId==user.Id&&x.Type=="support_reply").ToListAsync());
            db.ChangeTracker.Clear();ticket=await store.Act(id,admin.Id,new(ticket.Version,"resolve"),Guid.NewGuid().ToString(),default);
            var stale=ticket.Version;db.ChangeTracker.Clear();ticket=await store.Reply(id,user.Id,false,new(ticket.Version,"Tôi còn cần hỗ trợ."),Guid.NewGuid().ToString(),default);Assert.Equal("in_progress",ticket.Status);
            db.ChangeTracker.Clear();await Assert.ThrowsAsync<VersionConflictException>(()=>store.Act(id,admin.Id,new(stale,"close"),Guid.NewGuid().ToString(),default));
            db.ChangeTracker.Clear();ticket=await store.Act(id,admin.Id,new(ticket.Version,"resolve"),Guid.NewGuid().ToString(),default);
            db.ChangeTracker.Clear();ticket=await store.Act(id,admin.Id,new(ticket.Version,"close"),Guid.NewGuid().ToString(),default);
            db.ChangeTracker.Clear();await Assert.ThrowsAsync<BusinessRuleException>(()=>store.Reply(id,user.Id,false,new(ticket.Version,"Late"),Guid.NewGuid().ToString(),default));
            await Send("Thông tin xe password=SECRET_CONTEXT",order.Id);await Send("Thông tin xe",order.Id);Assert.True(session.SupportSuggested);Assert.Single(await db.SupportTickets.Where(x=>x.CustomerId==user.Id).ToListAsync());
            await Send("Nhờ nhân viên kiểm tra");Assert.NotEmpty(session.Draft!.Snapshot);Assert.DoesNotContain("SECRET",JsonSerializer.Serialize(session.Draft.Snapshot));
            await Act(Input("edit","Kiểm tra khoản chuyển",order.Id,order.Payments[0].Id) with {ChangeRequestId=change.Id});await Act(Input("confirm"));
            var linkedTicket=await store.Get(session.Draft!.RequestId!.Value,user.Id,1,20,default);Assert.Equal(order.Id,linkedTicket.OrderId);Assert.Equal(order.Payments[0].Id,linkedTicket.PaymentId);
            Assert.Equal(change.Id,linkedTicket.ChangeRequestId);
            Assert.Equal(2,await db.SupportTickets.CountAsync(x=>x.CustomerId==user.Id));
            await Send("Tôi đã chuyển tiền nhưng chưa cập nhật, nhờ nhân viên kiểm tra.");Assert.Contains("chuyển tiền",session.Draft!.Reason);
            await Act(Input("discard"));await Assert.ThrowsAsync<BusinessRuleException>(()=>Act(Input("confirm")));
        } finally {
            await db.NotificationEvents.Where(x=>x.UserId==user.Id).ExecuteDeleteAsync();await db.Notifications.Where(x=>x.UserId==user.Id).ExecuteDeleteAsync();
            db.ChangeTracker.Clear();var ids=db.SupportTickets.Where(x=>x.CustomerId==user.Id).Select(x=>x.Id);
            await db.SupportReplies.Where(x=>ids.Contains(x.TicketId)).ExecuteDeleteAsync();await db.SupportAudits.Where(x=>ids.Contains(x.TicketId)).ExecuteDeleteAsync();await db.SupportTickets.Where(x=>x.CustomerId==user.Id).ExecuteDeleteAsync();
            await db.Changes.Where(x=>x.Id==change.Id||x.Id==foreignChange.Id).ExecuteDeleteAsync();
            await db.Requests.Where(x=>x.Key.StartsWith(user.Id.ToString())||x.Key.StartsWith(admin.Id.ToString())).ExecuteDeleteAsync();await db.ChatSessions.Where(x=>x.UserId==user.Id).ExecuteDeleteAsync();
            await db.Orders.Where(x=>x.Id==order.Id||x.Id==foreign.Id).ExecuteDeleteAsync();await db.Users.Where(x=>x.Id==user.Id||x.Id==admin.Id||x.Id==other.Id).ExecuteDeleteAsync();
        }
    }
}
