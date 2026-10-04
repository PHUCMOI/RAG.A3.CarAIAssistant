using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;

public class OrderEvidenceTests
{
    sealed class Catalogue : ICommonCatalogue
    {
        public Task<CarSnapshot> GetCar(string id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<DealerSnapshot> GetDealer(long id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<WarrantySnapshot?> GetWarranty(string id,string brand,CancellationToken ct)=>throw new NotSupportedException();
    }
    static OrdersDb Open()=>new(new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options);
    [Fact]
    public void AllConfirmedTransactionsCountRegardlessOfPageAndLegacyDatesStayUnknown()
    {
        var order=new Order{TotalVnd=1000000};
        order.AddPayment("receipt",600000,"R1",null,"test");var receipt=order.Payments.Last();Assert.NotNull(receipt.CreatedAt);
        order.ConfirmPayment(receipt.Id,"test");
        order.AddPayment("refund",100000,"RF1",receipt.Id,"test");order.ConfirmPayment(order.Payments.Last().Id,"test");
        order.AddPayment("receipt",500,"FAILED",null,"test");order.FailPayment(order.Payments.Last().Id,"Chưa nhận tiền","test");
        order.AddPayment("receipt",500,"PENDING",null,"test");
        var p=OrderEvidence.Payments(order,2,1);Assert.Single(p.Transactions.Items);Assert.Equal(4,p.Transactions.TotalCount);
        Assert.Equal(600000,p.ReceivedVnd);Assert.Equal(100000,p.RefundedVnd);Assert.Equal(500000,p.NetReceived);Assert.Equal(500000,p.RemainingVnd);
        Assert.Equal("Chưa nhận tiền",OrderEvidence.Payments(order,reference:"FAILED").Transactions.Items.Single().FailureReason);
        Assert.Equal("not_found",OrderEvidence.Payments(order,reference:"invented").MatchStatus);
        Assert.Equal("matched",OrderEvidence.Payments(order,reference:"r1").MatchStatus);
        receipt.CreatedAt=null;Assert.Null(OrderEvidence.Payments(order,reference:"R1").Transactions.Items.Single().CreatedAt);
        Assert.All(OrderEvidence.Payments(order).Transactions.Items,x=>Assert.Null(x.DocumentUrl));
        order.Status="cancelled";
        var cancelled=OrderEvidence.Payments(order);Assert.Equal(0,cancelled.RemainingVnd);Assert.Contains("khoản còn giữ",OrderEvidence.Describe(cancelled));Assert.DoesNotContain("Còn phải trả",OrderEvidence.Describe(cancelled));
    }
    [Theory]
    [InlineData(0,10)] [InlineData(1,21)] [InlineData(100001,10)]
    public void PagesAreBounded(int page,int size)=>Assert.Throws<BusinessRuleException>(()=>OrderEvidence.Payments(new(),page,size));
    [Fact]
    public void PaymentAndDocumentsIntentAndFilteringUseExplicitData()
    {
        Assert.Equal(new[]{"payment","documents"},AssistantIntent.BusinessTopics("Khoản cọc hôm qua đã xác nhận chưa? Tôi thiếu giấy tờ nào?"));
        Assert.Equal("documents",AssistantIntent.Resolve("Tôi thiếu hồ sơ gì?"));
        Assert.Equal("profile",AssistantIntent.Resolve("Hồ sơ cá nhân"));
        Assert.Equal("payment",AssistantIntent.Resolve("Đã hoàn tiền bao nhiêu?"));
        Assert.Equal("readonly",AssistantIntent.Resolve("Hãy hoàn tiền cho tôi"));
        Assert.True(ConversationReferences.IsValid(new("documents","current",false,null,["documents","payment"])));
        Assert.Equal("txn-123",OrderEvidence.Filter("Mã giao dịch TXN-123").Reference);
        Assert.Equal(new DateOnly(2027,10,15),OrderEvidence.Filter("Khoản cọc 15/10/2027").Date);
        Assert.Equal(DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).DateTime).AddDays(-1),OrderEvidence.Filter("Khoản cọc hôm qua").Date);
    }
    [ContextDatabaseFact]
    public async Task ChecklistAndPaymentReadsAreFreshOwnedPagedAndVersioned()
    {
        await using var db=Open();
        var user=new UserRecord{Email=$"evidence-{Guid.NewGuid():N}@test.invalid",DisplayName="Customer"};
        var actor=new UserRecord{Email=$"evidence-{Guid.NewGuid():N}@test.invalid",DisplayName="Admin",Role="Admin"};
        var other=new UserRecord{Email=$"evidence-{Guid.NewGuid():N}@test.invalid",DisplayName="Other"};
        var order=new Order{CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),TotalVnd=1000000};
        order.AddPayment("receipt",600000,"R-"+Guid.NewGuid().ToString("N"),null,"test");
        var receipt=order.Payments.Single(); order.ConfirmPayment(receipt.Id,"test");
        order.AddPayment("refund",100000,"RF-"+Guid.NewGuid().ToString("N"),receipt.Id,"test");var refund=order.Payments.Last();
        var foreign=new Order{CustomerId=other.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant()};
        db.Users.AddRange(user,actor,other);db.Orders.AddRange(OrderStore.Row(order),OrderStore.Row(foreign));await db.SaveChangesAsync();db.ChangeTracker.Clear();
        var tx=new JourneyTransactions(db);var store=new OrderEvidenceStore(db,tx);var assistant=new OrderAssistant(db,new Catalogue(),null,new(){ContextEnabled=true});
        var session=await assistant.Create(user.Id,Guid.NewGuid(),default);
        async Task<ChatMessage> Send(string text) {db.ChangeTracker.Clear();session=await assistant.Send(session.Id,user.Id,new(Guid.NewGuid(),session.Version,text,order.Id),default);return session.Messages.Last();}
        try {
            var first=await Send("Thanh toán và giấy tờ còn thiếu?");Assert.Equal(new[]{"payment","documents"},first.Sections!.Select(x=>x.Topic));
            Assert.Equal(0,first.Sections![1].Documents!.Checklist.TotalCount);Assert.Contains("chưa cấu hình",first.Sections[1].Content);
            var input=new DocumentInput(0,"CCCD",true,"needs_changes","Ảnh bị mờ; cung cấp bản rõ hơn.");var id=Guid.NewGuid();var key=Guid.NewGuid().ToString();
            db.ChangeTracker.Clear();var created=await store.Save(order.Id,id,actor.Id,input,key,default);
            db.ChangeTracker.Clear();Assert.Equal(created,await store.Save(order.Id,id,actor.Id,input,key,default));
            db.ChangeTracker.Clear();await Assert.ThrowsAsync<VersionConflictException>(()=>store.Save(order.Id,id,actor.Id,input,Guid.NewGuid().ToString(),default));
            db.ChangeTracker.Clear();await store.Save(order.Id,Guid.NewGuid(),actor.Id,new(0,"Đăng ký",true,"missing",null),Guid.NewGuid().ToString(),default);
            var docs=await store.Documents(order.Id,user.Id,1,1,default);Assert.Single(docs.Checklist.Items);Assert.Equal(2,docs.Checklist.TotalCount);Assert.Equal(2,docs.RequiredOutstanding);
            first=await Send("Hồ sơ và thanh toán?");Assert.Contains(first.Sections![0].Documents!.Checklist.Items,x=>x.Status=="needs_changes"&&x.CustomerNote!.Contains("Ảnh bị mờ"));
            Assert.Equal(600000,first.Sections[1].Payment!.NetReceived);
            var fresh=new OrderStore(db,new Catalogue());db.ChangeTracker.Clear();
            var changed=await fresh.Mutate(order.Id,order.Version,new ConfirmRequest(order.Version),actor.Id.ToString(),Guid.NewGuid().ToString(),"confirm:"+refund.Id,o=>o.ConfirmPayment(refund.Id,"admin"),default);
            db.ChangeTracker.Clear();await store.Save(order.Id,id,actor.Id,new(created.Version,"CCCD",true,"valid","Đã kiểm tra."),Guid.NewGuid().ToString(),default);
            first=await Send("Thanh toán và hồ sơ?");Assert.Equal(500000,first.Sections![0].Payment!.NetReceived);Assert.Equal(100000,first.Sections[0].Payment!.RefundedVnd);Assert.Equal(1,first.Sections[1].Documents!.RequiredOutstanding);
            var filtered=await Send("Giao dịch hôm nay?");Assert.Equal("ambiguous",filtered.Sections!.Single().Payment!.MatchStatus);Assert.Contains("chọn",filtered.Content);
            filtered=await Send("Mã giao dịch "+receipt.Reference);Assert.Equal("matched",filtered.Sections!.Single().Payment!.MatchStatus);
            filtered=await Send("Mã giao dịch UNKNOWN-999");Assert.Equal("not_found",filtered.Sections!.Single().Payment!.MatchStatus);
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>store.Payments(order.Id,other.Id,1,10,null,null,default));
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>store.Payment(order.Id,receipt.Id,other.Id,default));
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>store.Payment(foreign.Id,receipt.Id,user.Id,default));
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>store.Documents(order.Id,other.Id,1,10,default));
            db.ChangeTracker.Clear();await Assert.ThrowsAsync<KeyNotFoundException>(()=>store.Save(foreign.Id,id,actor.Id,new(created.Version,"CCCD",true,"valid",null),Guid.NewGuid().ToString(),default));
            db.ChangeTracker.Clear();await Assert.ThrowsAsync<BusinessRuleException>(()=>store.Save(order.Id,Guid.NewGuid(),actor.Id,new(0,"Test",true,"needs_changes",null),Guid.NewGuid().ToString(),default));
            Assert.Equal(2,await db.Documents.CountAsync(x=>x.OrderId==order.Id));
        } finally {
            await db.NotificationEvents.Where(x=>x.UserId==user.Id).ExecuteDeleteAsync();
            db.ChangeTracker.Clear();await db.Documents.Where(x=>x.OrderId==order.Id).ExecuteDeleteAsync();
            await db.Notifications.Where(x=>x.UserId==user.Id).ExecuteDeleteAsync();await db.PaymentReferences.Where(x=>x.OrderId==order.Id).ExecuteDeleteAsync();
            await db.Requests.Where(x=>x.Key.StartsWith(actor.Id.ToString())).ExecuteDeleteAsync();await db.ChatSessions.Where(x=>x.UserId==user.Id).ExecuteDeleteAsync();
            await db.Orders.Where(x=>x.Id==order.Id||x.Id==foreign.Id).ExecuteDeleteAsync();await db.Users.Where(x=>x.Id==user.Id||x.Id==actor.Id||x.Id==other.Id).ExecuteDeleteAsync();
        }
    }
}
