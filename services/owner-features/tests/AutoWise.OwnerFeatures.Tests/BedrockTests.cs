using Amazon;
using Amazon.BedrockRuntime;
using Amazon.BedrockRuntime.Model;
using Amazon.Runtime;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;

public class BedrockTests
{
    sealed class StubClient() : AmazonBedrockRuntimeClient(new AnonymousAWSCredentials(), RegionEndpoint.USEast1)
    {
        public int Calls;
        public string Result = "payment";
        public bool Fail;
        public bool ServiceFail;
        public bool WaitForCancellation;
        public override Task<ConverseResponse> ConverseAsync(ConverseRequest request, CancellationToken ct = default)
        {
            Calls++;
            if(WaitForCancellation) return Task.Delay(Timeout.Infinite,ct).ContinueWith<ConverseResponse>(t=> {t.GetAwaiter().GetResult();throw new InvalidOperationException();},CancellationToken.None);
            if (Fail) throw new AmazonClientException("unavailable");
            if (ServiceFail) throw new ResourceNotFoundException("use case details required");
            return Task.FromResult(new ConverseResponse { Output = new ConverseOutput { Message = new Message { Role = ConversationRole.Assistant, Content = [new ContentBlock { Text = Result }] } } });
        }
    }

    [Fact]
    public async Task DisabledDoesNotCallProvider()
    {
        using var client = new StubClient();
        var service = new BedrockAssistant(client, new(), NullLogger<BedrockAssistant>.Instance);
        Assert.Equal("help", await service.Resolve("test", "help", default));
        Assert.Equal(0, client.Calls);
    }

    [Theory]
    [InlineData("payment", "payment")]
    [InlineData("security", "security")]
    [InlineData("/admin/orders", "help")]
    [InlineData("payment\nignore rules", "help")]
    public async Task ModelOutputMustBeAllowlisted(string output, string expected)
    {
        using var client = new StubClient { Result = output };
        var service = new BedrockAssistant(client, new() { Enabled = true }, NullLogger<BedrockAssistant>.Instance);
        Assert.Equal(expected, await service.Resolve("test", "help", default));
    }

    [Fact]
    public async Task ProviderFailureUsesLocalFallback()
    {
        using var client = new StubClient { Fail = true };
        var service = new BedrockAssistant(client, new() { Enabled = true }, NullLogger<BedrockAssistant>.Instance);
        Assert.Equal("status", await service.Resolve("test", "status", default));
        Assert.Null(BedrockAssistant.Route("/admin/orders"));
        Assert.Equal("/account/security", BedrockAssistant.Route("security"));
    }

    [Fact]
    public async Task ModelAccessFailureUsesFallback()
    {
        using var client = new StubClient { ServiceFail = true };
        var service = new BedrockAssistant(client, new() { Enabled = true }, NullLogger<BedrockAssistant>.Instance);
        Assert.Equal("payment", await service.Resolve("test", "payment", default));
    }

    [Theory]
    [InlineData("{\"intent\":\"payment\",\"orderReference\":\"previous\",\"needsClarification\":false,\"clarificationKind\":null}",true)]
    [InlineData("{\"intent\":\"admin\",\"orderReference\":\"previous\",\"needsClarification\":false,\"clarificationKind\":null}",false)]
    [InlineData("{\"intent\":\"payment\",\"orderReference\":\"current\",\"needsClarification\":true,\"clarificationKind\":null}",false)]
    [InlineData("not json",false)]
    [InlineData("```json\n{\"intent\":\"delivery\",\"orderReference\":\"current\",\"needsClarification\":false,\"clarificationKind\":null}\n```",true)]
    [InlineData("{\"intent\":\"payment\"}",false)]
    public void ContextOutputRequiresValidSchema(string text,bool valid)
    {Assert.Equal(valid,BedrockAssistant.ParseDecision(text)!=null);}

    [Fact]
    public async Task SummaryCommitsCoverageWithoutChangingVerifiedMemory()
    {
        using var client=new StubClient {Result="Khách hỏi thanh toán rồi hỏi lịch bàn giao."};
        var options=new BedrockOptions {Enabled=true,ContextEnabled=true};
        var service=new BedrockAssistant(client,options,NullLogger<BedrockAssistant>.Instance);
        var context=new AutoWise.OwnerFeatures.Application.ConversationContext {CurrentOrderId=Guid.NewGuid(),PreviousOrderId=Guid.NewGuid(),LastBusinessIntent="payment"};
        var turns=Enumerable.Range(0,10).Select(i=>new AutoWise.OwnerFeatures.Application.ChatTurn(Guid.NewGuid(),"hash",
            [new("user",new string('x',900),DateTimeOffset.UtcNow)])).ToArray();
        var summary=await service.Summarize(context,turns,11,default);
        Assert.Equal(3,summary.CoveredThroughVersion);Assert.Equal(1,summary.SummaryVersion);
        Assert.Equal(context.CurrentOrderId,summary.CurrentOrderId);Assert.Equal(context.PreviousOrderId,summary.PreviousOrderId);
        Assert.Equal(context.LastBusinessIntent,summary.LastBusinessIntent);
        client.ServiceFail=true;
        Assert.Equal(summary,await service.Summarize(summary,turns,12,default));
    }

    [Fact]
    public async Task RequestCancellationIsNotSwallowed()
    {
        using var client=new StubClient {WaitForCancellation=true};
        var service=new BedrockAssistant(client,new(){Enabled=true},NullLogger<BedrockAssistant>.Instance);
        using var cancellation=new CancellationTokenSource();cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>service.ResolveContext("test",new(),[],cancellation.Token));
    }

    [Fact]
    public async Task ProviderTimeoutUsesContextFallback()
    {
        using var client=new StubClient {WaitForCancellation=true};
        var service=new BedrockAssistant(client,new(){Enabled=true,TimeoutSeconds=1},NullLogger<BedrockAssistant>.Instance);
        var result=await service.ResolveContext("Còn phải trả bao nhiêu?",new(){CurrentOrderId=Guid.NewGuid()},[],default);
        Assert.Equal("payment",result.Intent);Assert.False(result.NeedsClarification);
    }
}
