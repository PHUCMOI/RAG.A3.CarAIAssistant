using System.Net;
using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;

public class DraftCompositionTests
{
    sealed class Handler : HttpMessageHandler
    {
        public int Calls;
        public JsonElement Data;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            Data = body.RootElement.GetProperty("verifiedData").Clone();
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new {
                answer=Data.GetProperty("retrievedAnswer").GetString(), status="ok", grounded=true,
                evidence=Array.Empty<object>(), citations=Array.Empty<object>() })) };
        }
    }

    [ContextDatabaseFact]
    public async Task CompositionReceivesOwnedDraftAndDoesNotSubmitOrRescheduleOrder()
    {
        await using var db = new OrdersDb(new DbContextOptionsBuilder<OrdersDb>()
            .UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options);
        var owner = new UserRecord { Email=$"draft-composition-{Guid.NewGuid():N}@test.invalid", DisplayName="Draft test" };
        var order = new Order { CustomerId=owner.Id, Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(), CarName="Test car", TotalVnd=1000000 };
        db.Users.Add(owner); db.Orders.Add(OrderStore.Row(order));
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        try
        {
            using var handler = new Handler();
            using var http = new HttpClient(handler) { BaseAddress=new("http://python.test/") };
            var assistant = new OrderAssistant(db, new CommonCatalogue(http), naturalAnswers:new NaturalAnswers(http));
            var session = await assistant.Create(owner.Id, Guid.NewGuid(), default);
            var input = new ChatInput(Guid.NewGuid(), session.Version,
                $"Tôi muốn đổi lịch nhận đơn {order.Code} sang 21/10/2026 vì bận công tác. Hãy tạo đề nghị giúp tôi.", null);
            session = await assistant.Send(session.Id, owner.Id, input, default);
            var draft = handler.Data.GetProperty("draft");
            Assert.Equal(order.Code, draft.GetProperty("orderCode").GetString());
            Assert.Equal("2026-10-21", draft.GetProperty("requestedDate").GetString());
            Assert.Equal("21/10/2026", draft.GetProperty("requestedDateDisplay").GetString());
            Assert.StartsWith("bận công tác", draft.GetProperty("reason").GetString());
            Assert.Equal("draft", draft.GetProperty("status").GetString());
            Assert.True(draft.GetProperty("requiresConfirmation").GetBoolean());
            Assert.False(draft.GetProperty("submitted").GetBoolean());
            Assert.False(draft.GetProperty("scheduleChanged").GetBoolean());
            Assert.False(handler.Data.GetProperty("actionExecuted").GetBoolean());
            Assert.NotNull(session.Draft);
            var replay = await assistant.Send(session.Id, owner.Id, input, default);
            Assert.Equal(session.Version, replay.Version);
            Assert.Equal(1, handler.Calls);
            Assert.Empty(await db.Changes.Where(c => c.OrderId == order.Id).ToListAsync());
            var savedOrder = OrderStore.Read(await db.Orders.AsNoTracking().SingleAsync(o => o.Id == order.Id));
            Assert.Equal(order.Version, savedOrder.Version);
            Assert.Equal(order.PlannedDate, savedOrder.PlannedDate);
            Assert.Equal(0, savedOrder.NetReceived);
        }
        finally
        {
            db.ChangeTracker.Clear();
            await db.ChatSessions.Where(s => s.UserId == owner.Id).ExecuteDeleteAsync();
            await db.Orders.Where(o => o.Id == order.Id).ExecuteDeleteAsync();
            await db.Users.Where(u => u.Id == owner.Id).ExecuteDeleteAsync();
        }
    }

    [ContextDatabaseFact]
    public async Task PendingRequestBecomesAnOwnedPersistentReplyWithoutCreatingAnotherDraft()
    {
        await using var db = new OrdersDb(new DbContextOptionsBuilder<OrdersDb>()
            .UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options);
        var owner = new UserRecord { Email=$"pending-composition-{Guid.NewGuid():N}@test.invalid", DisplayName="Pending test" };
        var order = new Order { CustomerId=owner.Id, Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(), CarName="Test car", TotalVnd=1000000 };
        var pending = new ChangeRecord { CustomerId=owner.Id, OrderId=order.Id, Reason="Đổi lịch vì bận công tác" };
        db.Users.Add(owner); db.Orders.Add(OrderStore.Row(order)); db.Changes.Add(pending);
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        try
        {
            using var handler = new Handler();
            using var http = new HttpClient(handler) { BaseAddress=new("http://python.test/") };
            var assistant = new OrderAssistant(db, new CommonCatalogue(http), naturalAnswers:new NaturalAnswers(http));
            var session = await assistant.Create(owner.Id, Guid.NewGuid(), default);
            var input = new ChatInput(Guid.NewGuid(), session.Version,
                $"Tôi muốn đổi lịch nhận đơn {order.Code} sang 25/10/2026 vì bận công tác. Hãy chuẩn bị bản nháp giúp tôi.", null);
            session = await assistant.Send(session.Id, owner.Id, input, default);
            var answer = session.Messages.Last();
            Assert.Equal("GetMyPendingChangeRequest", answer.Tool);
            Assert.Contains(pending.Code, answer.Content);
            Assert.Contains("chờ xử lý", answer.Content);
            Assert.Null(session.Draft);
            Assert.False(handler.Data.GetProperty("draftPrepared").GetBoolean());
            Assert.False(handler.Data.GetProperty("actionExecuted").GetBoolean());
            var section = Assert.Single(answer.Sections!);
            Assert.Equal("/account/change-requests?requestId="+pending.Id, section.DetailUrl);
            Assert.Equal("success", section.ResultStatus);
            var replay = await assistant.Send(session.Id, owner.Id, input, default);
            Assert.Equal(session.Version, replay.Version);
            Assert.Equal(1, handler.Calls);
            var reopened = await assistant.Get(session.Id, owner.Id, default);
            Assert.Contains(pending.Code, Assert.Single(reopened.Messages.Last().Sections!).Content);
            var saved = Assert.Single(await db.Changes.AsNoTracking().Where(c=>c.OrderId==order.Id).ToListAsync());
            Assert.Equal(pending.Id, saved.Id); Assert.Equal("pending", saved.Status); Assert.Equal(1, saved.Version);
            var unchanged = OrderStore.Read(await db.Orders.AsNoTracking().SingleAsync(o=>o.Id==order.Id));
            Assert.Equal(order.Version, unchanged.Version); Assert.Equal(order.PlannedDate, unchanged.PlannedDate);
        }
        finally
        {
            db.ChangeTracker.Clear();
            await db.ChatSessions.Where(s=>s.UserId==owner.Id).ExecuteDeleteAsync();
            await db.Changes.Where(c=>c.OrderId==order.Id).ExecuteDeleteAsync();
            await db.Orders.Where(o=>o.Id==order.Id).ExecuteDeleteAsync();
            await db.Users.Where(u=>u.Id==owner.Id).ExecuteDeleteAsync();
        }
    }
}
