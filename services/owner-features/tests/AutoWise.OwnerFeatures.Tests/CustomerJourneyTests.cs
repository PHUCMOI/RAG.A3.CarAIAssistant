using AutoWise.OwnerFeatures.Domain;
namespace AutoWise.OwnerFeatures.Tests;

public class CustomerJourneyTests
{
    [Theory]
    [InlineData("0901 234 567", "+84901234567")]
    [InlineData("+1 (202) 555-0100", "+12025550100")]
    [InlineData("", null)]
    public void NormalizesContact(string raw, string? expected) => Assert.Equal(expected, CustomerRules.Phone(raw));
    [Theory]
    [InlineData("123")]
    [InlineData("090123456789")]
    [InlineData("abc")]
    public void RejectsInvalidPhone(string raw) => Assert.Throws<BusinessRuleException>(() => CustomerRules.Phone(raw, true));
    [Fact] public void RequiredPhoneCannotBeEmpty() => Assert.Throws<BusinessRuleException>(() => CustomerRules.Phone(null, true));
    [Fact]
    public void ProfileAndProposalValidation()
    {
        Assert.Equal("Mai", CustomerRules.Name(" Mai "));
        Assert.Throws<BusinessRuleException>(() => CustomerRules.Name(" "));
        Assert.Throws<BusinessRuleException>(() => CustomerRules.Text(" "));
        Assert.Throws<VersionConflictException>(() => CustomerRules.Version(2, 1));
        foreach (var status in new[] { "completed", "cancelled" })
            Assert.Throws<BusinessRuleException>(() => CustomerRules.ActiveOrder(new() { Status = status }));
    }
    [Theory]
    [InlineData("submitted", "accept")]
    [InlineData("submitted", "withdraw")]
    [InlineData("in_consultation", "convert")]
    [InlineData("in_consultation", "response")]
    public void AllowedTransitions(string from, string action) => PurchaseRequest.Transition(from, action);
    [Theory]
    [InlineData("converted", "convert")]
    [InlineData("submitted", "convert")]
    [InlineData("in_consultation", "withdraw")]
    [InlineData("withdrawn", "accept")]
    public void TerminalOrOutOfSequenceTransitionsFail(string from, string action) => Assert.Throws<BusinessRuleException>(() => PurchaseRequest.Transition(from, action));
}
