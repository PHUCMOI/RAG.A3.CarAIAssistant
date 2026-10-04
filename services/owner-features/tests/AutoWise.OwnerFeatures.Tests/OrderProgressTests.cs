using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;

public class OrderProgressTests
{
    [Theory]
    [InlineData("pending_confirmation","Chờ xác nhận")]
    [InlineData("confirmed","Đã xác nhận")]
    [InlineData("preparing_vehicle","Đang chuẩn bị xe")]
    [InlineData("ready_for_handover","Chờ bàn giao")]
    [InlineData("completed","Hoàn thành")]
    [InlineData("cancelled","Đã hủy")]
    public void EveryStateHasGuidanceWithoutInventingHistory(string status,string label)
    {
        var order=new Order {Status=status,TotalVnd=1000000};
        var progress=OrderProgress.Build(order);
        Assert.Equal(label,progress.StatusLabel);
        Assert.NotEmpty(progress.Description);Assert.Empty(progress.Timeline);
        Assert.Contains("Chưa có lịch sử",progress.HistoryNotice);
        Assert.NotEmpty(progress.NextActions);
        Assert.All(progress.NextActions,a=>Assert.Equal("/account/orders/"+order.Id,a.DetailUrl));
        if(status is "completed" or "cancelled") {
            Assert.DoesNotContain(progress.NextActions,a=>a.Actor=="dealer");
            Assert.DoesNotContain(progress.NextActions,a=>a.Content.Contains("hoàn tất thanh toán") || a.Content.Contains("trước khi nhận xe"));
        } else Assert.Contains(progress.NextActions,a=>a.Actor=="dealer");
    }

    [Fact]
    public void LegacyHistoryIsSanitizedAndOnlyRecordedMilestonesAppear()
    {
        var first=new DateTimeOffset(2026,10,1,1,0,0,TimeSpan.Zero);
        var order=new Order {Status="ready_for_handover",History=[
            new(){At=first.AddHours(2),Action="status",Detail="confirmed → preparing_vehicle: SECRET_REASON",Actor="SECRET_ACTOR"},
            new(){At=first,Action="created",Detail="SECRET_PRICE",Actor="SECRET_ACTOR"},
            new(){At=first.AddHours(1),Action="status",Detail="confirmed"},
            new(){Action="status",Detail="private note mentioning completed"},
            new(){Action="progress_note",Detail="SECRET_NOTE"},
            new(){Action="delivery",Detail="SECRET_LOCATION_REASON"}
        ]};
        var progress=OrderProgress.Build(order);
        Assert.Equal(new[]{"created","status","status","delivery"},progress.Timeline.Select(m=>m.Kind));
        Assert.Equal(first,progress.Timeline[0].At);
        Assert.Equal("preparing_vehicle",progress.Timeline[2].Status);
        Assert.DoesNotContain(progress.Timeline,m=>m.Status=="ready_for_handover" || m.Status=="completed");
        Assert.DoesNotContain("SECRET",JsonSerializer.Serialize(progress,OrderStore.Json));
        Assert.DoesNotContain("SECRET",OrderProgress.Describe(progress));
        Assert.Contains("Chưa có lý do chờ",OrderProgress.Describe(progress));
    }

    [Fact]
    public void ConfirmedScheduleMustBeExplicitAndChangesInvalidateItByDefault()
    {
        var order=new Order {Status="preparing_vehicle"};
        var date=new DateOnly(2026,10,15);
        order.Schedule(date,null,"Đại lý","PRIVATE","admin",true);
        Assert.Equal("confirmed",OrderProgress.Build(order).Schedule.State);
        Assert.NotNull(order.DeliveryConfirmedAt);
        Assert.True(order.History.Last().DeliveryScheduleConfirmed);
        order.Schedule(date.AddDays(1),null,"Đại lý","PRIVATE","admin");
        Assert.Equal("planned",OrderProgress.Build(order).Schedule.State);
        Assert.Null(order.DeliveryConfirmedAt);
        Assert.False(order.History.Last().DeliveryScheduleConfirmed);
        var legacy=JsonSerializer.Deserialize<Order>("{\"plannedDate\":\"2026-10-15\",\"status\":\"preparing_vehicle\"}",OrderStore.Json)!;
        Assert.Equal("planned",OrderProgress.Build(legacy).Schedule.State);
        legacy.DeliveryScheduleConfirmed=true;
        Assert.Equal("planned",OrderProgress.Build(legacy).Schedule.State);
    }

    [Fact]
    public void PublicWaitingReasonIsSeparateValidatedAndClearedWithStatus()
    {
        var order=new Order();
        order.UpdateCustomerWaitingReason("  Chờ đại lý kiểm tra thông tin.  ","PRIVATE_REASON","PRIVATE_ADMIN");
        Assert.Equal("Chờ đại lý kiểm tra thông tin.",OrderProgress.Build(order).WaitingReason);
        Assert.DoesNotContain("PRIVATE",OrderProgress.Describe(OrderProgress.Build(order)));
        order.Transition("confirmed","PRIVATE_STATUS_REASON","PRIVATE_ADMIN");
        Assert.Equal("pending_confirmation",order.History.Last().FromStatus);
        Assert.Equal("confirmed",order.History.Last().ToStatus);
        Assert.Null(OrderProgress.Build(order).WaitingReason);
        order.UpdateCustomerWaitingReason("note","audit","admin");
        order.UpdateCustomerWaitingReason("   ","clear","admin");Assert.Null(order.CustomerWaitingReason);
        Assert.Throws<BusinessRuleException>(()=>order.UpdateCustomerWaitingReason(new string('x',501),"audit","admin"));
        Assert.Throws<BusinessRuleException>(()=>order.UpdateCustomerWaitingReason("note","","admin"));
        order.Status="completed";
        Assert.Throws<BusinessRuleException>(()=>order.UpdateCustomerWaitingReason("note","audit","admin"));
    }

    [Fact]
    public void ReadyDoesNotMeanPaidAndActualHandoverIsNotInferred()
    {
        var order=new Order {Status="ready_for_handover",TotalVnd=1000000};
        var progress=OrderProgress.Build(order);
        Assert.Contains(progress.NextActions,a=>a.Actor=="customer" && a.Content.Contains("còn phải trả"));
        Assert.Equal("none",progress.Schedule.State);
        Assert.Null(progress.Schedule.ActualHandoverAt);
        order.ActualHandoverAt=new DateTimeOffset(2026,10,1,0,0,0,TimeSpan.Zero);
        progress=OrderProgress.Build(order);
        Assert.Equal("handed_over",progress.Schedule.State);
        Assert.Empty(progress.Timeline);
        Assert.DoesNotContain(progress.NextActions,a=>a.Content.Contains("trước khi nhận xe"));
        Assert.Contains("07:00",OrderProgress.ScheduleDescription(progress.Schedule));
        order.Status="cancelled";
        Assert.Equal("cancelled",OrderProgress.Build(order).Schedule.State);
        Assert.Contains("không còn áp dụng",OrderProgress.Describe(OrderProgress.Build(order)));
    }

    [Theory]
    [InlineData("Đang chuẩn bị xe nghĩa là sao? Tôi cần làm gì tiếp?")]
    [InlineData("Bước tiếp theo của đơn này là gì?")]
    [InlineData("Đơn đang chờ gì? Lý do chờ là gì?")]
    [InlineData("Chờ xác nhận nghĩa là sao? Tôi cần làm gì?")]
    public void ProgressQuestionsWorkWithoutModel(string question)
        => Assert.Equal(new[]{"status"},ConversationReferences.Fallback(question,new(){CurrentOrderId=Guid.NewGuid()}).Topics);

    [Fact]
    public void ReadingConfirmedScheduleDoesNotBecomeAMutation()
    {
        Assert.Equal("delivery",AssistantIntent.Resolve("Lịch giao đã được xác nhận chưa?"));
        Assert.Equal("readonly",AssistantIntent.Resolve("Hãy xác nhận đơn AW-001"));
    }

    [Fact]
    public void NewProgressToolRecoversSameStatusContextAsLegacy()
    {
        var context=ConversationContext.Recover(Guid.NewGuid(),[new(Guid.NewGuid(),"hash",[new("assistant","old",DateTimeOffset.UtcNow,"GetMyOrderProgress")])]);
        Assert.Equal("status",context.LastBusinessIntent);
    }
}
