using System.Net;
using System.Text.Json;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;

public class AdminAssistantTests
{
    [Theory]
    [InlineData("", "overview", null)]
    [InlineData("Hỏi", "sql", null)]
    [InlineData("Hỏi", "orders", "invalid")]
    public void RejectsInvalidToolsAndFilters(string question, string scope, string? status) =>
        Assert.Throws<BusinessRuleException>(() => AdminAssistant.Validate(new(question, scope, Status: status)));

    [Fact]
    public void ProjectionExcludesAuditHistoryAndUsesConfirmedPayments()
    {
        var order = new Order { Code = "AW-TEST", TotalVnd = 1000, Status = "confirmed" };
        order.History.Add(new() { Detail = "PRIVATE AUDIT", Actor = "ADMIN" });
        order.Payments.Add(new() { Type = "receipt", AmountVnd = 600, Status = "confirmed" });
        order.Payments.Add(new() { Type = "refund", AmountVnd = 100, Status = "confirmed" });
        order.Payments.Add(new() { Type = "receipt", AmountVnd = 400, Status = "pending" });
        var json = JsonSerializer.Serialize(AdminAssistant.ProjectOrder(order), OrderStore.Json);
        Assert.DoesNotContain("PRIVATE AUDIT", json);
        using var data = JsonDocument.Parse(json);
        Assert.Equal(500, data.RootElement.GetProperty("netReceived").GetInt64());
        Assert.Equal(500, data.RootElement.GetProperty("remainingVnd").GetInt64());
        Assert.Equal("Đã xác nhận", data.RootElement.GetProperty("orderStatusLabel").GetString());
    }

    sealed class Handler : HttpMessageHandler
    {
        public List<string> Bodies = [];
        public bool Grounded = true;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Bodies.Add(await request.Content!.ReadAsStringAsync(ct));
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new {
                answer = "Kết quả quản trị", grounded = Grounded, status = "ok", evidence = Array.Empty<object>(), citations = Array.Empty<object>()
            })) };
        }
    }
    sealed class NoCatalogue : AutoWise.OwnerFeatures.Application.ICommonCatalogue
    {
        public Task<AutoWise.OwnerFeatures.Application.CarSnapshot> GetCar(string id, CancellationToken ct) => throw new NotSupportedException();
        public Task<AutoWise.OwnerFeatures.Application.DealerSnapshot> GetDealer(long id, CancellationToken ct) => throw new NotSupportedException();
        public Task<AutoWise.OwnerFeatures.Application.WarrantySnapshot?> GetWarranty(string carId, string brand, CancellationToken ct) => throw new NotSupportedException();
    }

    [ContextDatabaseFact]
    public async Task AdminToolsReadRealDatabaseAndRejectCustomerBeforeModel()
    {
        await using var db = new OrdersDb(new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options);
        var admin = new UserRecord { Email = $"admin-ai-{Guid.NewGuid():N}@test.invalid", DisplayName = "Admin AI", Role = "Admin" };
        var customer = new UserRecord { Email = $"customer-ai-{Guid.NewGuid():N}@test.invalid", DisplayName = "Customer AI" };
        db.Users.AddRange(admin, customer);
        var order = new Order { CustomerId = customer.Id, Code = "AW-" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant(), CustomerName = "Customer AI", TotalVnd = 1000 };
        db.Orders.Add(OrderStore.Row(order)); await db.SaveChangesAsync();
        var handler = new Handler();
        using var http = new HttpClient(handler) { BaseAddress = new("http://ai.test/") };
        var service = new AdminAssistant(db, new OrderStore(db, new NoCatalogue()), new NaturalAnswers(http));
        try
        {
            await Assert.ThrowsAsync<BusinessRuleException>(() => service.Send(customer.Id, new("Thống kê"), default));
            Assert.Empty(handler.Bodies);
            var reply = await service.Send(admin.Id, new($"Kiểm tra {order.Code}"), default);
            Assert.Contains(reply.Links, l => l.Path == $"/admin/orders/{order.Id}");
            Assert.Contains(order.Code, handler.Bodies[0]);
            Assert.DoesNotContain("passwordHash", handler.Bodies[0]);
            await service.Send(admin.Id, new("Tìm khách", "customers", customer.Email), default);
            Assert.Contains(customer.Email, handler.Bodies[1]);
            await service.Send(admin.Id, new("Thống kê", "overview"), default);
            await service.Send(admin.Id, new("Phiếu", "support", "NONEXISTENT"), default);
            handler.Grounded = false;
            await Assert.ThrowsAsync<HttpRequestException>(() => service.Send(admin.Id, new("Thống kê"), default));
            Assert.Equal(1, await db.Orders.CountAsync(x => x.Id == order.Id));
        }
        finally
        {
            await db.Orders.Where(x => x.Id == order.Id).ExecuteDeleteAsync();
            await db.Users.Where(x => x.Id == admin.Id || x.Id == customer.Id).ExecuteDeleteAsync();
        }
    }
}
