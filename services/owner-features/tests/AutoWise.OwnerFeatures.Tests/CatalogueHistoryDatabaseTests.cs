using System.Net;
using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;

public class CatalogueHistoryDatabaseTests
{
    sealed class Handler : HttpMessageHandler
    {
        public int Calls;
        public string? UnderstoodQuestion;
        public string? RetrievedQuestion;
        public List<CatalogContext>? RememberedCars;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            var question = body.RootElement.GetProperty("question").GetString();
            object result;
            if (request.RequestUri!.AbsolutePath == "/api/chat/understand")
            {
                UnderstoodQuestion = question;
                RememberedCars = body.RootElement.GetProperty("context").TryGetProperty("lastContexts", out var cars)
                    ? JsonSerializer.Deserialize<List<CatalogContext>>(cars.GetRawText(), OrderStore.Json) : null;
                result = new { question, route="catalogue", needsClarification=false, clarification=(string?)null };
            }
            else
            {
                RetrievedQuestion = question;
                result = new { answer="So sánh Mazda CX-5 với Toyota Camry.", status="ok", grounded=true,
                    generationMode="bedrock-natural", contexts=new[] { new CatalogContext("mazda", "Mazda CX-5"), new CatalogContext("camry", "Toyota Camry") } };
            }
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(result, OrderStore.Json)) };
        }
    }

    [ContextDatabaseFact]
    public async Task ReopenedHistoryResolvesBrandWithoutAnOrderAndReplaysWithoutModelCalls()
    {
        var options = new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options;
        await using var db = new OrdersDb(options);
        var owner = new UserRecord { Email=$"catalogue-history-{Guid.NewGuid():N}@test.invalid", DisplayName="History test" };
        var id = Guid.NewGuid();
        var messages = new List<ChatMessage> {
            new("user", "So sánh Honda CR-V với Mazda CX-5", DateTimeOffset.UtcNow, Catalog:true),
            new("assistant", "Hai mẫu xe", DateTimeOffset.UtcNow, Catalog:true,
                Contexts:[new("honda", "Honda CR-V"), new("mazda", "Mazda CX-5")]) };
        db.Users.Add(owner);
        db.ChatSessions.Add(new() { Id=id, UserId=owner.Id, Version=2,
            Payload=JsonSerializer.Serialize(new[] {new ChatTurn(Guid.NewGuid(), "prior", messages)}, OrderStore.Json) });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        try
        {
            using var handler = new Handler();
            using var http = new HttpClient(handler) { BaseAddress=new("http://python.test/") };
            var orders = new OrderAssistant(db, new CommonCatalogue(http));
            var catalogue = new CatalogueAssistant(db, http, new("http://images.test/"));
            var assistant = new UnifiedAssistant(db, http, new("http://images.test/"), orders, catalogue);
            const string original = "Hãy so sánh chiếc mazda bên trên với Toyota Camry cho tôi";
            var input = new UnifiedChatInput(Guid.NewGuid(), 2, original);
            var result = await assistant.Send(id, owner.Id, input, default);
            Assert.Contains("Mazda CX-5", handler.UnderstoodQuestion);
            Assert.Contains("Mazda CX-5", handler.RetrievedQuestion);
            Assert.Contains("Toyota Camry", handler.RetrievedQuestion);
            Assert.NotNull(handler.RememberedCars);
            Assert.Equal(new[] { "honda", "mazda" }, handler.RememberedCars.Select(c => c.CarId));
            Assert.Equal(original, result.Messages[^2].Content);
            Assert.Null(result.SelectedOrderId);
            Assert.True(result.Messages.Last().Catalog);
            Assert.Equal("ok", result.Messages.Last().Status);
            Assert.Equal(2, handler.Calls);
            var replay = await assistant.Send(id, owner.Id, input, default);
            Assert.Equal(result.Version, replay.Version);
            Assert.Equal(2, handler.Calls);
            var reopened = await orders.Get(id, owner.Id, default);
            Assert.Equal(original, reopened.Messages[^2].Content);
            await Assert.ThrowsAsync<KeyNotFoundException>(() => assistant.Send(id, Guid.NewGuid(), input, default));
        }
        finally
        {
            db.ChangeTracker.Clear();
            await db.ChatSessions.Where(s => s.Id == id).ExecuteDeleteAsync();
            await db.Users.Where(u => u.Id == owner.Id).ExecuteDeleteAsync();
        }
    }
}
