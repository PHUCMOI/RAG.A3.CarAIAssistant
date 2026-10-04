using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

public class NotificationTests
{
    sealed class Clock(DateTimeOffset now) : TimeProvider { public DateTimeOffset Now = now; public override DateTimeOffset GetUtcNow() => Now; }
    sealed class FailDelivery : SaveChangesInterceptor
    {
        public bool Fail = true;
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        {
            if (Fail && data.Context!.ChangeTracker.Entries<NotificationRecord>().Any(x=>x.State==EntityState.Added)) throw new InvalidOperationException("INTERNAL_SECRET_ERROR");
            return ValueTask.FromResult(result);
        }
    }
    static OrdersDb Open(SaveChangesInterceptor? interceptor=null)
    {
        var options=new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE"));
        if(interceptor!=null) options.AddInterceptors(interceptor);
        return new(options.Options);
    }
    sealed class Fixture(OrdersDb db, UserRecord user, Order order) : IAsyncDisposable
    {
        public readonly OrdersDb Db=db; public readonly UserRecord User=user; public readonly Order Order=order;
        public static async Task<Fixture> Create(SaveChangesInterceptor? interceptor=null)
        {
            var db=Open(interceptor);var user=new UserRecord{Email=$"notify-{Guid.NewGuid():N}@test.invalid"};
            var order=new Order{CustomerId=user.Id,Code="AW-"+Guid.NewGuid().ToString("N"),TotalVnd=1000000};
            db.Users.Add(user);db.Orders.Add(OrderStore.Row(order));await db.SaveChangesAsync();db.ChangeTracker.Clear();return new(db,user,order);
        }
        public async Task Persist() {Db.ChangeTracker.Clear();var row=await Db.Orders.SingleAsync(x=>x.Id==Order.Id);row.Payload=JourneyTransactions.Pack(Order);row.Version=Order.Version;row.Status=Order.Status;await Db.SaveChangesAsync();Db.ChangeTracker.Clear();}
        public async ValueTask DisposeAsync()
        {
            Db.ChangeTracker.Clear();await Db.NotificationEvents.Where(x=>x.UserId==User.Id).ExecuteDeleteAsync();await Db.Notifications.Where(x=>x.UserId==User.Id).ExecuteDeleteAsync();
            await Db.Documents.Where(x=>x.OrderId==Order.Id).ExecuteDeleteAsync();await Db.PaymentReferences.Where(x=>x.OrderId==Order.Id).ExecuteDeleteAsync();
            await Db.Changes.Where(x=>x.OrderId==Order.Id).ExecuteDeleteAsync();await Db.ChatSessions.Where(x=>x.UserId==User.Id).ExecuteDeleteAsync();
            await Db.Requests.Where(x=>x.Key.StartsWith(User.Id.ToString())).ExecuteDeleteAsync();
            await Db.Orders.Where(x=>x.Id==Order.Id).ExecuteDeleteAsync();await Db.Users.Where(x=>x.Id==User.Id).ExecuteDeleteAsync();await Db.DisposeAsync();
        }
    }
    static readonly DateOnly Date=new(2027,10,20);
    [Fact]
    public void VietnamDateAnchorAndScheduleVersionsAreStableOnNoOp()
    {
        Assert.Equal(new DateTimeOffset(2027,10,19,1,0,0,TimeSpan.Zero),NotificationEvents.ReminderAt(Date));
        Assert.Equal(new DateTimeOffset(2027,1,1,1,0,0,TimeSpan.Zero),NotificationEvents.ReminderAt(new(2027,1,2)));
        var o=new Order();o.Schedule(Date,null,"Đại lý","INTERNAL","admin",true);var version=o.Version;
        o.Schedule(Date,null,"Đại lý","another reason","admin",true);Assert.Equal(version,o.Version);Assert.Equal(1,o.DeliveryScheduleVersion);
        o.Schedule(Date.AddDays(1),null,"Đại lý","changed","admin",true);Assert.Equal(2,o.DeliveryScheduleVersion);
    }
    [ContextDatabaseFact]
    public async Task CommittedEventsSurviveRestartDeduplicateAndRollbackIsInvisible()
    {
        await using var f=await Fixture.Create();var db=f.Db;var now=NotificationEvents.ReminderAt(Date);var clock=new Clock(now);var tx=new JourneyTransactions(db);
        var key=Guid.NewGuid().ToString();
        async Task<string> Work(){NotificationEvents.Add(db,f.User.Id,"event","Public","/account/orders/"+f.Order.Id,"order_status",f.Order.Id);var row=db.NotificationEvents.Local.Single();row.DueAt=now;return await Task.FromResult("saved");}
        await tx.Run(f.User.Id,key,"event",new{},Work,default);db.ChangeTracker.Clear();await tx.Run(f.User.Id,key,"event",new{},Work,default);
        Assert.Empty(await db.Notifications.Where(x=>x.UserId==f.User.Id).ToListAsync());
        await using(var restarted=Open()) await new NotificationDelivery(restarted,clock).RunBatch(default,recipient:f.User.Id);
        await using(var restarted=Open()) await new NotificationDelivery(restarted,clock).RunBatch(default,recipient:f.User.Id);
        var notice=Assert.Single(await db.Notifications.AsNoTracking().Where(x=>x.UserId==f.User.Id).ToListAsync());Assert.Equal("/account/assistant?orderId="+f.Order.Id,notice.ChatUrl);
        db.ChangeTracker.Clear();await Assert.ThrowsAsync<InvalidOperationException>(()=>tx.Run<string>(f.User.Id,Guid.NewGuid().ToString(),"rollback",new{},async()=>{
            NotificationEvents.Add(db,f.User.Id,"rolled-back","Invisible","/account/notifications");await db.SaveChangesAsync();throw new InvalidOperationException();},default));
        db.ChangeTracker.Clear();Assert.False(await db.NotificationEvents.AnyAsync(x=>x.UserId==f.User.Id&&x.EventKey=="rolled-back"));
        // Both unique keys enforce exactly one notification per event/type, even across competing workers.
        var eventRow=await db.NotificationEvents.SingleAsync(x=>x.UserId==f.User.Id);eventRow.Status="pending";await db.SaveChangesAsync();
        async Task Race(){await using var raced=Open();await new NotificationDelivery(raced,clock).RunBatch(default,recipient:f.User.Id);}
        await Task.WhenAll(Race(),Race());Assert.Equal(1,await db.Notifications.CountAsync(x=>x.UserId==f.User.Id));
    }
    [ContextDatabaseFact]
    public async Task FailuresHaveBoundedBackoffSafeErrorAndExplicitRetry()
    {
        var failure=new FailDelivery();await using var f=await Fixture.Create(failure);var db=f.Db;var clock=new Clock(NotificationEvents.ReminderAt(Date));var delivery=new NotificationDelivery(db,clock);
        NotificationEvents.Add(db,f.User.Id,"retry","Public","/account/notifications");db.NotificationEvents.Local.Single().DueAt=clock.Now;await db.SaveChangesAsync();
        for(var i=1;i<=5;i++){
            await delivery.RunBatch(default,recipient:f.User.Id);var row=await db.NotificationEvents.AsNoTracking().SingleAsync(x=>x.UserId==f.User.Id);
            Assert.Equal(i,row.Attempts);Assert.DoesNotContain("SECRET",row.ErrorCode);Assert.Equal(i==5?"failed":"pending",row.Status);
            if(i<5){Assert.True(row.DueAt>clock.Now);Assert.Equal(0,await delivery.RunBatch(default,recipient:f.User.Id));clock.Now=row.DueAt;}
        }
        var failed=await db.NotificationEvents.AsNoTracking().SingleAsync(x=>x.UserId==f.User.Id);failure.Fail=false;
        await delivery.Retry(failed.Id,default);await delivery.RunBatch(default,recipient:f.User.Id);await delivery.RunBatch(default,recipient:f.User.Id);
        Assert.Single(await db.Notifications.Where(x=>x.UserId==f.User.Id).ToListAsync());
    }
    [ContextDatabaseFact]
    public async Task ReminderIsSingleAndOldScheduleIsCancelledWithoutAffectingBusinessNotices()
    {
        await using var f=await Fixture.Create();var db=f.Db;var clock=new Clock(NotificationEvents.ReminderAt(Date).AddHours(-2));var o=f.Order;
        o.Schedule(Date,null,"Đại lý","internal","admin",true);await f.Persist();await NotificationEvents.Schedule(db,o,clock.Now,default);await db.SaveChangesAsync();
        o.Schedule(Date.AddDays(1),null,"Đại lý","internal","admin",true);await f.Persist();await NotificationEvents.Schedule(db,o,clock.Now,default);await db.SaveChangesAsync();
        Assert.Equal(1,await db.NotificationEvents.CountAsync(x=>x.UserId==f.User.Id&&x.Status=="cancelled"));
        clock.Now=NotificationEvents.ReminderAt(Date);var delivery=new NotificationDelivery(db,clock);Assert.Equal(0,await delivery.RunBatch(default,recipient:f.User.Id));
        clock.Now=NotificationEvents.ReminderAt(Date.AddDays(1));await delivery.RunBatch(default,recipient:f.User.Id);await delivery.RunBatch(default,recipient:f.User.Id);
        Assert.Single(await db.Notifications.Where(x=>x.UserId==f.User.Id).ToListAsync());
        await delivery.SetPreferences(f.User.Id,false,default);NotificationEvents.Add(db,f.User.Id,"business","Business","/account/orders/"+o.Id);db.NotificationEvents.Local.Single(x=>x.EventKey=="business").DueAt=clock.Now;await db.SaveChangesAsync();
        await delivery.RunBatch(default,recipient:f.User.Id);Assert.Equal(2,await db.Notifications.CountAsync(x=>x.UserId==f.User.Id));
        var account=new CustomerAccountStore(db,new Catalogue(),new(db));var notice=await db.Notifications.AsNoTracking().FirstAsync(x=>x.UserId==f.User.Id);
        await account.MarkRead(f.User.Id,notice.Id,default);await Assert.ThrowsAsync<KeyNotFoundException>(()=>account.MarkRead(Guid.NewGuid(),notice.Id,default));
        await using var restarted=Open();Assert.False(await restarted.Users.Where(x=>x.Id==f.User.Id).Select(x=>x.DeliveryRemindersEnabled).SingleAsync());Assert.NotNull((await restarted.Notifications.SingleAsync(x=>x.Id==notice.Id)).ReadAt);
    }
    [ContextDatabaseFact]
    public async Task WorkerRevalidatesEveryInvalidReminderAndLateCreationNeverCatchesUp()
    {
        await using var f=await Fixture.Create();var db=f.Db;var o=f.Order;var due=NotificationEvents.ReminderAt(Date);var clock=new Clock(due);var delivery=new NotificationDelivery(db,clock);
        foreach(var invalid in new[]{"unconfirmed","cancelled","completed","version","date","disabled","handover","late"}){
            o.Status="confirmed";o.ActualHandoverAt=null;o.PlannedDate=Date;o.DeliveryScheduleConfirmed=true;o.DeliveryScheduleVersion++;
            await delivery.SetPreferences(f.User.Id,true,default);clock.Now=due;
            var e=new NotificationEventRecord{UserId=f.User.Id,OrderId=o.Id,Type="delivery_reminder",EventKey=invalid,Title="Reminder",PlannedDate=Date,ScheduleVersion=o.DeliveryScheduleVersion,DueAt=due};
            db.NotificationEvents.Add(e);await db.SaveChangesAsync();
            switch(invalid){case "unconfirmed":o.DeliveryScheduleConfirmed=false;break;case "cancelled":case "completed":o.Status=invalid;break;case "version":o.DeliveryScheduleVersion++;break;case "date":o.PlannedDate=Date.AddDays(1);break;case "disabled":await delivery.SetPreferences(f.User.Id,false,default);break;case "handover":o.ActualHandoverAt=due;break;case "late":clock.Now=due.AddMinutes(5);break;}
            await f.Persist();await delivery.RunBatch(default,recipient:f.User.Id);Assert.Equal("cancelled",(await db.NotificationEvents.AsNoTracking().SingleAsync(x=>x.Id==e.Id)).Status);
        }
        Assert.Empty(await db.Notifications.Where(x=>x.UserId==f.User.Id).ToListAsync());
        o.Status="confirmed";o.ActualHandoverAt=null;o.DeliveryScheduleConfirmed=true;o.PlannedDate=Date;o.DeliveryScheduleVersion++;
        await NotificationEvents.Schedule(db,o,due.AddTicks(1),default);await db.SaveChangesAsync();Assert.Equal(8,await db.NotificationEvents.CountAsync(x=>x.UserId==f.User.Id));
        await delivery.SetPreferences(f.User.Id,true,default);await delivery.RunBatch(default,recipient:f.User.Id);Assert.Empty(await db.Notifications.Where(x=>x.UserId==f.User.Id).ToListAsync());
    }
    sealed class Catalogue : ICommonCatalogue
    {
        public Task<CarSnapshot> GetCar(string id,CancellationToken ct)=>Task.FromResult(new CarSnapshot(id,"Car","Brand",null));
        public Task<DealerSnapshot> GetDealer(long id,CancellationToken ct)=>Task.FromResult(new DealerSnapshot(id,"Dealer",["Brand"]));
        public Task<WarrantySnapshot?> GetWarranty(string id,string brand,CancellationToken ct)=>Task.FromResult<WarrantySnapshot?>(null);
    }
    [ContextDatabaseFact]
    public async Task CommittingScheduleChangeWhileWorkerWaitsCannotDeliverOldReminder()
    {
        await using var f=await Fixture.Create();var db=f.Db;var o=f.Order;var due=NotificationEvents.ReminderAt(Date);
        o.Schedule(Date,null,"Đại lý","internal","admin",true);await f.Persist();
        await NotificationEvents.Schedule(db,o,due.AddHours(-1),default);await db.SaveChangesAsync();db.ChangeTracker.Clear();
        await using var transaction=await db.Database.BeginTransactionAsync();
        var row=await db.Orders.FromSqlInterpolated($"SELECT * FROM orders_service.orders WHERE \"Id\"={o.Id} FOR UPDATE").SingleAsync();
        await using var workerDb=Open();var task=new NotificationDelivery(workerDb,new Clock(due)).RunBatch(default,recipient:f.User.Id);
        o.Schedule(Date.AddDays(1),null,"Đại lý","changed","admin",true);row.Payload=JourneyTransactions.Pack(o);row.Version=o.Version;
        await NotificationEvents.Schedule(db,o,due,default);await db.SaveChangesAsync();await transaction.CommitAsync();
        await task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Empty(await db.Notifications.Where(x=>x.UserId==f.User.Id).ToListAsync());
        Assert.Single(await db.NotificationEvents.Where(x=>x.UserId==f.User.Id&&x.Status=="cancelled").ToListAsync());
        Assert.Single(await db.NotificationEvents.Where(x=>x.UserId==f.User.Id&&x.Status=="pending").ToListAsync());
    }
    [ContextDatabaseFact]
    public async Task BusinessProducersArePublicExactAndOnlyEmitRelevantChanges()
    {
        await using var f=await Fixture.Create();var db=f.Db;var o=f.Order;var store=new OrderStore(db,new Catalogue());
        async Task Mutate(Action<Order> work){db.ChangeTracker.Clear();o=await store.Mutate(o.Id,o.Version,new{Version=o.Version},f.User.Id.ToString(),Guid.NewGuid().ToString(),"test",work,default);}
        await Mutate(x=>x.Transition("confirmed","INTERNAL_SECRET","admin"));
        await Mutate(x=>x.AddPayment("receipt",1000,"P-"+Guid.NewGuid().ToString("N"),null,"admin"));
        await Mutate(x=>x.ConfirmPayment(x.Payments.Single().Id,"admin"));
        await Mutate(x=>x.UpdateCustomerWaitingReason("Khách chờ xe","INTERNAL_SECRET","admin"));
        await Mutate(x=>x.Schedule(Date,null,"Đại lý","INTERNAL_SECRET","admin",true));
        await Mutate(x=>x.Schedule(Date,null,"Đại lý","INTERNAL_SECRET2","admin",true));
        var tx=new JourneyTransactions(db);var evidence=new OrderEvidenceStore(db,tx);var id=Guid.NewGuid();db.ChangeTracker.Clear();
        var document=await evidence.Save(o.Id,id,f.User.Id,new(0,"CCCD",true,"needs_changes","Ảnh mờ"),Guid.NewGuid().ToString(),default);db.ChangeTracker.Clear();
        await evidence.Save(o.Id,id,f.User.Id,new(document.Version,"CCCD",true,"needs_changes","Ảnh mờ"),Guid.NewGuid().ToString(),default);
        var account=new CustomerAccountStore(db,new Catalogue(),tx);db.ChangeTracker.Clear();var change=await account.Change(f.User.Id,new(o.Id,"change","Đổi ngày"),Guid.NewGuid().ToString(),default);db.ChangeTracker.Clear();
        await account.Decide(change.Id,f.User.Id,new(change.Version,"approved","PUBLIC_RESPONSE"),Guid.NewGuid().ToString(),default);
        var events=await db.NotificationEvents.AsNoTracking().Where(x=>x.UserId==f.User.Id).ToListAsync();
        Assert.Equal(new[]{"change_decision","delivery_reminder","delivery_schedule","document_needs_changes","order_status","payment_confirmed"},events.Select(x=>x.Type).OrderBy(x=>x));
        Assert.All(events,x=>{Assert.DoesNotContain("INTERNAL_SECRET",x.Title);Assert.Equal(f.User.Id,x.UserId);});
        Assert.Equal("/account/change-requests?requestId="+change.Id,events.Single(x=>x.Type=="change_decision").DetailUrl);
        // Chat reads current order, not the status contained in an earlier notification.
        await Mutate(x=>x.Transition("preparing_vehicle","INTERNAL_SECRET","admin"));
        db.ChangeTracker.Clear();var assistant=new OrderAssistant(db,new Catalogue(),null,new(){ContextEnabled=true});var session=await assistant.Create(f.User.Id,Guid.NewGuid(),default);
        session=await assistant.Send(session.Id,f.User.Id,new(Guid.NewGuid(),session.Version,"Tiến độ đơn này?",o.Id),default);
        Assert.Equal("preparing_vehicle",session.Messages.Last().Sections!.Single().Progress!.Status);
    }
}
