using AutoWise.OwnerFeatures.Application;

public class ConversationContextTests
{
    [Fact]
    public void RememberKeepsPreviousDistinctOrderAndBusinessTopic()
    {
        var first = Guid.NewGuid(); var second = Guid.NewGuid(); var now = DateTimeOffset.UtcNow;
        var context = new ConversationContext().Remember(first, "payment", now)
            .Remember(second, "delivery", now).Remember(second, "help", now);
        Assert.Equal(first, context.PreviousOrderId);
        Assert.Equal(second, context.CurrentOrderId);
        Assert.Equal("delivery", context.LastBusinessIntent);
    }

    [Fact]
    public void PreviousReferenceWithoutPreviousOrderRequiresClarification()
    {
        var decision = ConversationReferences.Fallback("Đơn trước còn phải trả bao nhiêu?", new());
        Assert.Equal("previous", decision.OrderReference);
        Assert.True(decision.NeedsClarification);
    }

    [Fact]
    public void ExplicitOrderSwitchCanInheritLastTopic()
    {
        var decision = ConversationReferences.Fallback("Còn đơn AW-DEMO-0007 thì sao?", new() { LastBusinessIntent = "delivery" });
        Assert.Equal("delivery", decision.Intent);
        Assert.Equal("explicit", decision.OrderReference);
    }

    [Fact]
    public void LegacySessionRecoversTopicFromSuccessfulTool()
    {
        var id = Guid.NewGuid();
        var turns = new[] { new ChatTurn(Guid.NewGuid(), "hash", [new("assistant", "result", DateTimeOffset.UtcNow, "GetMyOrderPaymentSummary")]) };
        var context = ConversationContext.Recover(id, turns);
        Assert.Equal(id, context.CurrentOrderId);
        Assert.Equal("payment", context.LastBusinessIntent);
    }

    [Fact]
    public void BuilderBoundsHistoryAndNeverSendsOrderIdsOrBusinessAnswers()
    {
        var id=Guid.NewGuid();
        var turns=Enumerable.Range(0,20).Select(i=>new ChatTurn(Guid.NewGuid(),"hash",
            [new("user",new string('x',1000),DateTimeOffset.UtcNow),new("assistant","SECRET_AMOUNT",DateTimeOffset.UtcNow,"GetMyOrderPaymentSummary")])).ToArray();
        var text=ConversationContextBuilder.Build("Còn bao nhiêu?",new(){CurrentOrderId=id},turns,8,3000);
        Assert.True(text.Length<=3000);
        Assert.DoesNotContain(id.ToString(),text);
        Assert.DoesNotContain("SECRET_AMOUNT",text);
        Assert.Contains("hasCurrentOrder",text);
    }
}
