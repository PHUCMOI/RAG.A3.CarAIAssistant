using AutoWise.OwnerFeatures.Domain;
namespace AutoWise.OwnerFeatures.Tests;

public class OrderTests
{
    static Order Draft() => new() { TotalVnd = 1000, DepositRequiredVnd = 100 };
    [Fact]
    public void CannotSkipStatusOrCompleteBeforePaymentAndDelivery()
    {
        var o = Draft(); Assert.Throws<BusinessRuleException>(() => o.Transition("completed", "test", "admin"));
        foreach (var status in new[] { "confirmed", "preparing_vehicle", "ready_for_handover" }) o.Transition(status, "test", "admin");
        Assert.Throws<BusinessRuleException>(() => o.Transition("completed", "test", "admin"));
        o.AddPayment("receipt", 1000, "ref", null, "admin"); o.ConfirmPayment(o.Payments[0].Id, "admin");
        Assert.Throws<BusinessRuleException>(() => o.Transition("completed", "test", "admin"));
        o.Schedule(DateOnly.FromDateTime(DateTime.UtcNow), DateTimeOffset.UtcNow.AddMinutes(-1), "dealer", "test", "admin");
        o.Transition("completed", "test", "admin"); Assert.Equal(0, o.RemainingVnd);
        Assert.Throws<BusinessRuleException>(() => o.AddPayment("refund", 100, "refund", o.Payments[0].Id, "admin"));
    }
    [Fact]
    public void PendingFailedAndExcessReceiptsDoNotCount()
    {
        var o = Draft(); o.AddPayment("receipt", 500, "a", null, "admin"); Assert.Equal(0, o.NetReceived);
        o.FailPayment(o.Payments[0].Id, "failed", "admin"); Assert.Equal(0, o.NetReceived);
        o.AddPayment("receipt", 1001, "b", null, "admin"); Assert.Throws<BusinessRuleException>(() => o.ConfirmPayment(o.Payments[1].Id, "admin")); Assert.Equal(0, o.NetReceived);
    }
    [Fact]
    public void RefundsCannotExceedOriginalAndCancellationRequiresZeroNet()
    {
        var o = Draft(); o.AddPayment("receipt", 500, "a", null, "admin"); o.ConfirmPayment(o.Payments[0].Id, "admin");
        Assert.Throws<BusinessRuleException>(() => o.Transition("cancelled", "test", "admin"));
        o.AddPayment("refund", 300, "b", o.Payments[0].Id, "admin"); o.ConfirmPayment(o.Payments[1].Id, "admin");
        o.AddPayment("refund", 201, "c", o.Payments[0].Id, "admin"); Assert.Throws<BusinessRuleException>(() => o.ConfirmPayment(o.Payments[2].Id, "admin"));
        o.AddPayment("refund", 200, "d", o.Payments[0].Id, "admin"); o.ConfirmPayment(o.Payments[3].Id, "admin");
        o.Transition("cancelled", "test", "admin"); Assert.Equal(0, o.NetReceived);
    }
    [Fact]
    public void VersionAndPaymentReferencesAreChecked()
    {
        var o = Draft(); Assert.Throws<VersionConflictException>(() => o.CheckVersion(0));
        o.AddPayment("receipt", 100, "a", null, "admin"); Assert.Throws<BusinessRuleException>(() => o.AddPayment("receipt", 100, "a", null, "admin"));
        Assert.Throws<BusinessRuleException>(() => o.Schedule(DateOnly.FromDateTime(DateTime.UtcNow), DateTimeOffset.UtcNow.AddDays(1), "dealer", "test", "admin"));
    }
    [Theory]
    [InlineData(0, 0)]
    [InlineData(100, 101)]
    [InlineData(100, -1)]
    [InlineData(100000000001, 0)]
    public void InvalidPricesAreRejected(long total, long deposit) => Assert.Throws<BusinessRuleException>(() => Order.ValidateAmounts(total, deposit));
}
