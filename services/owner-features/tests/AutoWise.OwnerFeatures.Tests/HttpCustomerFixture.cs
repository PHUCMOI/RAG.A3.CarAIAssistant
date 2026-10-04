using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;

// HTTP regressions use a disposable customer so repeated runs do not fill demo sessions.
public sealed class HttpCustomerFixture : IAsyncDisposable
{
    readonly OrdersDb db;
    public UserRecord User {get;}
    public List<string> Codes {get;}=[];
    HttpCustomerFixture(OrdersDb db,UserRecord user){this.db=db;User=user;}
    public static async Task<HttpCustomerFixture> Create()
    {
        var db=new OrdersDb(new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")??"Host=localhost;Port=5432;Database=car_rag;Username=car_rag;Password=car_rag_dev").Options);
        var source=await db.Users.AsNoTracking().SingleAsync(x=>x.Email=="customer1@autowise.test");
        var user=new UserRecord{Email=$"http-{Guid.NewGuid():N}@test.invalid",DisplayName="HTTP regression",PasswordHash=source.PasswordHash};
        var fixture=new HttpCustomerFixture(db,user);db.Users.Add(user);
        foreach(var code in new[]{"AW-DEMO-0001","AW-DEMO-0007"}) {
            var order=OrderStore.Read(await db.Orders.AsNoTracking().SingleAsync(x=>x.Code==code));
            order.Id=Guid.NewGuid();order.CustomerId=user.Id;order.CustomerName=user.DisplayName;order.Code="AW-"+order.Id.ToString("N").ToUpperInvariant();
            fixture.Codes.Add(order.Code);db.Orders.Add(OrderStore.Row(order));
        }
        await db.SaveChangesAsync();db.ChangeTracker.Clear();return fixture;
    }
    public async ValueTask DisposeAsync()
    {
        db.ChangeTracker.Clear();await db.ChatSessions.Where(x=>x.UserId==User.Id).ExecuteDeleteAsync();
        await db.Orders.Where(x=>x.CustomerId==User.Id).ExecuteDeleteAsync();await db.Users.Where(x=>x.Id==User.Id).ExecuteDeleteAsync();await db.DisposeAsync();
    }
}
